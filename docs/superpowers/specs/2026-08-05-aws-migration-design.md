# SiteDoc AI — Migration from Render to AWS

**Date:** 2026-08-05
**Status:** Approved design, pending implementation plan
**Author:** Claude (brainstorming session with @kyle41io)

---

## 1. Goal

Move SiteDoc AI off Render's free tier onto AWS, so that:

1. **The app loads instantly.** Render's free tier spins the container down after
   ~15 minutes idle, so the first visitor pays a full Docker cold start. This is
   the problem that triggered the migration.
2. **Audits survive.** Render's free tier has no persistent disk, so the SQLite
   database and every screenshot are lost on each restart.
3. **Running cost stays at ~$0/month**, permanently — not for a 12-month
   promotional window.
4. **Behavior is preserved.** Every user-visible feature works exactly as it does
   today. This is a deployment-architecture change, not a product change.

Non-goals: new product features, redesign, multi-region, custom domain.

## 2. Current state

| Layer | Today |
|---|---|
| Hosting | Render free tier, Docker web service, single always-on container |
| Web | Next.js 16.2.7, `next start`, SSR report page + 3 API route handlers |
| Scanning | Playwright Chromium in-process, capped at 1 concurrent scan (512 MB RAM) |
| Jobs | In-memory `ConcurrencyQueue`; work runs *after* the HTTP response returns |
| Records | SQLite at `.data/sitedoc.db` (`AUDIT_STORE=sqlite`) |
| Screenshots | Local disk `.data/audit-artifacts/{id}/`, served by a route handler |
| PDF | Chromium launched in-process, navigating `127.0.0.1:$PORT` over loopback |
| Secrets | Render dashboard environment variables |

Three properties of this design assume a long-lived process with a local disk,
and each one breaks under serverless:

- **Deferred work.** `enqueueAudit` ([`src/lib/audit/job-queue.ts`](../../../src/lib/audit/job-queue.ts))
  returns immediately and the scan continues in the background. Serverless
  freezes execution when the response is sent.
- **Local state.** The SQLite file and screenshot directory are per-instance.
- **Loopback rendering.** The PDF route navigates the app's own server on
  `127.0.0.1`, which only works when the renderer and the web server are the same
  process.

Everything else — the scanner, axe-core checks, SEO/performance analysis,
scoring, AI enrichment, i18n, SSRF validation — is pure library code in
`src/lib` and moves unchanged.

## 3. Decisions

Recorded with the alternatives, because the reasoning matters more than the
outcome.

### 3.1 Static frontend, not server-rendered

The frontend is a **static Next.js export** on S3 behind CloudFront. The three
API route handlers and the PDF renderer become Lambda functions.

**Why:** it is the only option that removes the cold start from the page load
entirely — S3 + CloudFront serve the shell from the edge with no compute in the
path. The alternative (running Next.js in a Lambda container behind CloudFront)
would need an EventBridge warmer pinging the function every few minutes to
approximate what CloudFront does natively.

**What it costs:** `output: "export"` drops Next API routes and server
components, so the report page becomes client-rendered and the handlers move out
of Next. Acceptable because the SSR here is not load-bearing: the home page is
already `"use client"`, the report page has no `generateMetadata`, and there is
no `next/image` usage. Per-report link unfurls are lost; a generic static Open
Graph card for `/report/*` recovers most of that value.

### 3.2 Lambda Function URLs with CloudFront OAC, not API Gateway

**Why:** API Gateway HTTP API's 1M-request free tier expires after 12 months.
Lambda Function URLs have no per-request charge, ever. Origin Access Control
signs origin requests with SigV4, so the URLs are not publicly invocable — the
same trust mechanism the S3 origins use.

**Consequences to handle:** the origin request policy must be
`AllViewerExceptHostHeader`, because forwarding the viewer `Host` header breaks
the SigV4 signature. OAC signing for requests **with a body** (`POST /api/audits`)
must be verified during implementation; if it does not work, the fallback is
`auth_type = NONE` plus a secret header injected by CloudFront as a custom origin
header and validated in the handler.

**Bonus simplification:** because the frontend and API share one CloudFront
origin, there is **no CORS configuration anywhere** — and therefore none of the
preflight-shadowing trap that cost Interview-Prepare a debugging cycle.

### 3.3 SQS between the API and the scan

**Why:** this replaces the in-process background queue that a long-lived
container gave for free. It also adds retries and a dead-letter queue the current
design has no equivalent for.

The existing `runAuditJob` / `RunAuditDeps` seam is what makes this cheap: the
SQS worker calls `runAuditJob` with the same dependencies the container used.

### 3.4 Chromium ships as a Lambda container image

**Why:** basing the image on `mcr.microsoft.com/playwright:v1.60.0-jammy` — the
same base the current [`Dockerfile`](../../../Dockerfile) uses — guarantees the
scanner drives **the same Chromium build that the test suite and existing audit
scores were produced with**. Audit output is browser-dependent, so a different
browser silently changes the product's results.

**Rejected:** a zip package with `@sparticuz/chromium`. Playwright's own Chromium
is ~450 MB unpacked and exceeds Lambda's 250 MB zip limit, which is what that
package exists to solve — but it targets `puppeteer-core`, `playwright-core`
support is community-reported rather than supported, and it is a *different*
Chromium build. Saving ~$0.20/month is not worth introducing variance into the
core product output.

**What it costs:** ECR private storage is not in the always-free tier (500 MB
free for 12 months, then ~$0.10/GB-month). With a lifecycle policy retaining the
last 3 images this lands at roughly **$0.10–0.30/month** — the one place this
architecture is not literally $0.

### 3.5 DynamoDB with gzipped records and a 30-day TTL

**Why DynamoDB:** every access pattern is "get this audit by id" and "overwrite
this audit" — exactly a partition key. On-demand billing is genuinely $0 when
idle, and 25 GB of storage is always free. RDS would bill per instance-hour and
drag Lambda into VPC networking (ENI cold starts, NAT gateway charges) for no
benefit.

**No GSI.** Nothing in the app queries across audits. One will be added if and
when a real access pattern needs it.

**Why gzip:** current records are ~10 KB of JSON that compresses ~3:1.
DynamoDB's hard item limit is 400 KB, and a pathological target site (hundreds of
axe violations, a wall of console errors) could approach that raw. Compressing
the serialized record buys ~3× headroom through one mechanism, with no second
storage path and no pointer-chasing read.

**Why TTL:** DynamoDB expires items itself, free. No cleanup Lambda to write,
deploy, monitor or pay for. An S3 lifecycle rule expires screenshots on the same
30-day schedule so records and artifacts disappear together.

### 3.6 SSM Parameter Store for secrets

Standard parameters are free; Secrets Manager is $0.40 per secret per month
($0.80 for the two AI keys here). Neither rotation nor cross-account resource
policies — Secrets Manager's actual differentiators — is required. With rotation
as a requirement, the decision reverses.

### 3.7 SQLite is removed

`SqliteAuditStore` and `better-sqlite3` are deleted. A Lambda has no persistent
disk and `/tmp` is not shared between functions, so SQLite cannot store
production records under any serverless design. Its only remaining role would be
optional local-dev durability, at the cost of keeping a native module compiling
in CI and in the container image. `LocalAuditStore` (JSON files) covers dev;
DynamoDB covers production.

### 3.8 Defaults

- **Region `us-east-1`** — single region; also where CloudFront's ACM
  certificates must live if a custom domain is ever added.
- **No custom domain** — the default `*.cloudfront.net` domain and its free
  certificate. A Route 53 hosted zone is $0.50/month, which would be the only
  recurring line item.
- **30-day retention** for records and screenshots.

## 4. Architecture

```
                    Browser
                       │ HTTPS
                       ▼
   ┌──────────────────────────────────────────────────────────┐
   │  CloudFront  ·  PriceClass_100  ·  default *.cloudfront   │
   └───┬──────────┬───────────────┬──────────────┬────────────┘
       │ default  │ /report*      │ /artifacts/* │ /api/*  /pdf/*
       ▼          ▼               ▼              ▼
   ┌────────────────────────┐ ┌──────────────┐ ┌──────────────────────┐
   │ S3 sitedoc-frontend    │ │ S3 artifacts │ │ Lambda Function URLs │
   │ private, OAC           │ │ private, OAC │ │ private, OAC (SigV4) │
   │ static Next export     │ │ screenshots  │ │  api  ·  pdf         │
   └────────────────────────┘ └──────────────┘ └──────────┬───────────┘
        ▲ CloudFront Function                             │ SendMessage
        │ rewrites /report/<id> → /report/index.html       ▼
                                                  ┌────────────────┐
                                                  │ SQS sitedoc-   │
                                                  │ scan  ──▶ DLQ  │
                                                  └───────┬────────┘
                                                          ▼
                                              ┌───────────────────────┐
                                              │ Lambda sitedoc-scan   │
                                              │ container image (ECR) │
                                              │ 2048 MB · 300 s       │
                                              └───┬───────────┬───────┘
                                                  ▼           ▼
                                        DynamoDB audits   S3 artifacts
                                                  ▲
                          SSM Parameter Store (SecureString) ──▶ scan only
```

### 4.1 Lambda functions

Split on privilege and on shape, not on aesthetics.

| Function | Package | Memory / timeout | May touch |
|---|---|---|---|
| `sitedoc-api` | zip, esbuild bundle, `nodejs22.x` | 512 MB / 15 s | DynamoDB `GetItem`+`PutItem`, `sqs:SendMessage` |
| `sitedoc-scan` | container image (ECR) | 2048 MB / 300 s | DynamoDB `GetItem`+`PutItem`, S3 artifact `PutObject`, SSM read + `kms:Decrypt`, SQS consume |
| `sitedoc-pdf` | same container image | 2048 MB / 120 s | DynamoDB `GetItem`, SSM read of one plain parameter |

Rationale:

1. **The interactive path is a small zip.** `sitedoc-api` cold-starts in a couple
   hundred milliseconds because the Chromium image never touches the request a
   user waits on.
2. **Least privilege is expressible.** `sitedoc-pdf` cannot write anything and
   cannot reach the AI keys. Only `sitedoc-scan` holds SSM secret permissions.
3. **Timeouts fit the work.** 300 s suits a scan; it would be dangerous on a
   record read. `sitedoc-api` gets 15 s rather than a tighter bound because
   `validatePublicHttpUrl` performs DNS resolution against a user-supplied
   hostname, which can be slow for a host that does not resolve.

`sitedoc-scan` and `sitedoc-pdf` share one image with different
`image_config.command` values (`scan.handler`, `pdf.handler`), so there is one
image to build, push and pay ECR storage for.

Memory note: 2048 MB gives the scanner ~1.2 vCPU and 4× Render's RAM, which
retires the OOM-restart problem and the `SITEDOC_MAX_CONCURRENT_SCANS=1` cap.
Lambda's always-free 400,000 GB-seconds covers roughly 8,000 scans/month at 25 s
each.

`AWS_REGION` is **not** set as a user environment variable on any function — it
is reserved and injected by the runtime.

### 4.2 CloudFront behaviors

Ordered most-specific first.

| Path pattern | Origin | Cache policy | Notes |
|---|---|---|---|
| `/api/*` | `sitedoc-api` Function URL | `CachingDisabled` | `AllViewerExceptHostHeader`; all methods |
| `/pdf/*` | `sitedoc-pdf` Function URL | `CachingDisabled` | `AllViewerExceptHostHeader` |
| `/artifacts/*` | S3 artifacts | `CachingOptimized` | immutable PNGs, edge-cached |
| `/report/*` | S3 frontend | `CachingOptimized` | viewer-request CloudFront Function rewrites URI to `/report.html` |
| `*` (default) | S3 frontend | `CachingOptimized` | includes `/_next/*` build assets |

**404 handling maps only 403, deliberately.** S3 with OAC returns `403` for a
missing key (there is no `s3:ListBucket` grant), so a single custom error
response `403 → /404.html` with response code 404 covers unknown pages. `404` is
left unmapped on purpose: `GET /api/audits?id=` legitimately returns a JSON 404
for an unknown audit, and custom error responses are distribution-wide — mapping
404 would replace that JSON body with an HTML page and break the client's
not-found handling.

The pattern is `/report/*`, not `/report*`, so it cannot accidentally capture an
unrelated path such as `/reporting`. A bare `/report` with no id falls through to
the default behavior and resolves to the 404 page, which is correct — a report
without an id does not exist.

Both S3 bucket policies grant `s3:GetObject` to the `cloudfront.amazonaws.com`
service principal conditioned on `AWS:SourceArn` matching this one distribution.
Without that condition the policy trusts any CloudFront distribution in any AWS
account — the confused-deputy hole in S3-behind-CloudFront setups.

### 4.3 Data model

**DynamoDB `sitedoc_audits`** — `PAY_PER_REQUEST`, composite key:

| Attribute | Value |
|---|---|
| `pk` (S) | `AUDIT#<id>` |
| `sk` (S) | `META` |
| `record` (B) | gzipped JSON of the `AuditRecord` |
| `status` (S) | plain copy of the record status, for cheap inspection |
| `ttl` (N) | epoch seconds, `createdAt + 30 days`; TTL enabled on this attribute |

The store enforces a size guard: if the compressed payload still exceeds ~350 KB
it truncates in a fixed order — `consoleErrors` first, then `failedRequests`,
then `issues` (retaining the most severe) — logging what it dropped and setting a
flag on the record, rather than throwing away the audit. Fixed order matters so
the outcome is deterministic and the highest-value content survives.

**Bucket names must be globally unique**, so both buckets are suffixed with the
account id: `sitedoc-frontend-<account_id>`, `sitedoc-artifacts-<account_id>`,
and `sitedoc-tfstate-<account_id>` for the state bucket. They are referred to by
their short names elsewhere in this document.

**S3 `sitedoc-artifacts`** — private, OAC. Keys `audits/{id}/{desktop,mobile}.png`,
written with `Content-Type: image/png` and
`Cache-Control: public, max-age=31536000, immutable` (the same headers the
current artifact route sets). Lifecycle rule expires objects after 30 days.
Public URL shape: `/artifacts/{id}/desktop.png`.

**S3 `sitedoc-frontend`** — private, OAC. The static export from `out/`.

**SQS `sitedoc-scan`** — standard queue, visibility timeout 360 s (must exceed
the 300 s function timeout), redrive to `sitedoc-scan-dlq` after 2 receives.
Event source mapping: batch size 1, `maximum_concurrency = 2`,
`reportBatchItemFailures`.

Standard queues are at-least-once, so the worker **skips a job whose record is
already `completed`** (one cheap `GetItem`) rather than burning a second Chromium
run.

**SSM parameters** under `/sitedoc-ai/`:

| Name | Type | Read by |
|---|---|---|
| `ANTHROPIC_API_KEY` | `SecureString` | `sitedoc-scan` |
| `OPENAI_API_KEY` | `SecureString` | `sitedoc-scan` |
| `public-base-url` | `String` | `sitedoc-pdf` |

Terraform declares the two secret parameters with a placeholder value and
`lifecycle { ignore_changes = [value] }`; real values are set out-of-band with
the AWS CLI. Terraform state stores every managed attribute in plaintext, so a
secret passed through a Terraform variable is a secret written to state.

### 4.4 The `public-base-url` cycle, and why it exists

`sitedoc-pdf` needs the CloudFront domain to navigate to, but the CloudFront
distribution depends on the function's URL — so passing the domain as a
Terraform-managed environment variable is a dependency cycle.

Resolution: Terraform writes the canonical base URL to the plain SSM parameter
`/sitedoc-ai/public-base-url` after the distribution exists, and `sitedoc-pdf`
reads it once at cold start and caches it in module scope. A runtime read is not
a Terraform dependency, so the cycle disappears.

Rejected alternative: deriving the base URL from the request's `Host` header via
a CloudFront Function. It removes the SSM read, but puts viewer-influenced input
into the URL the renderer navigates — not a trade worth making in a service whose
entire threat model is "do not fetch attacker-chosen URLs".

## 5. Application changes

Guiding rule: **nothing in `src/lib` learns about AWS except three new adapters.**
Every existing abstraction seam is preserved.

### 5.1 New adapters

**`DynamoAuditStore`** — `src/lib/store/dynamo-store.ts`, implementing the
existing two-method `AuditStore` interface. Selected by `AUDIT_STORE=dynamo` in
[`src/lib/store/index.ts`](../../../src/lib/store/index.ts), which already reads
the variable with bracket access so Next's bundler cannot inline it. Owns the
gzip round-trip and the size guard.

**`ArtifactStore`** — a new interface, because
[`src/lib/store/local-store.ts`](../../../src/lib/store/local-store.ts) currently
exposes bare path helpers with no abstraction:

```ts
interface ArtifactStore {
  /** Directory the scanner writes PNGs into (.data/… locally, /tmp in Lambda). */
  stagingDirectory(auditId: string): string;
  /** Publish staged files; called once after capture. */
  publish(auditId: string, files: string[]): Promise<void>;
  /** Public URL for a published artifact. */
  urlFor(auditId: string, file: string): string;
}
```

`LocalArtifactStore` stages in `.data/audit-artifacts/<id>` and no-ops
`publish`. `S3ArtifactStore` stages in `/tmp/<id>` and `PutObject`s each file.
Both return `/artifacts/<id>/<file>` from `urlFor`, so dev and production share
one URL shape.

The scanner already accepts an `artifactDirectory`
([`src/lib/playwright-scanner.ts`](../../../src/lib/playwright-scanner.ts)), so
it receives the staging directory and gains one `publish()` call after capture.
**The scanner never learns S3 exists**, and its unit tests are unchanged.

**`AuditDispatcher`** — `src/lib/audit/dispatch.ts`:

```ts
interface AuditDispatcher { dispatch(job: AuditJob): Promise<void>; }
```

`InProcessDispatcher` wraps the existing `ConcurrencyQueue` + `runAuditJob`
(unchanged behavior for dev and tests). `SqsDispatcher` sends the job as a
message. `ConcurrencyQueue` and `runAuditJob` are **not modified** — the SQS
worker calls `runAuditJob` with the same `productionDeps`.

### 5.2 Handlers become framework-free

The bodies of the current Next route handlers move into `src/lib/api/audits.ts`
as pure functions over the domain (`createAudit`, `getAudit`). A new top-level
`lambda/` directory then holds only plumbing:

| File | Role |
|---|---|
| `lambda/api.ts` | Function URL handler (payload format 2.0) → `createAudit` / `getAudit` |
| `lambda/scan.ts` | SQS handler → `runAuditJob`, with `reportBatchItemFailures` |
| `lambda/pdf.ts` | Function URL handler → Chromium render |
| `lambda/http.ts` | Shared response and error-mapping helpers |
| `lambda/secrets.ts` | SSM hydration into `process.env` |
| `esbuild.config.mjs` | Bundles each entry to `dist-lambda/<name>/index.js` |

`lambda/secrets.ts` mirrors the gating that worked in Interview-Prepare: no
`SSM_PREFIX` means do nothing (local dev uses real env vars), a populated target
variable is never requested from SSM, only still-missing parameters are fetched,
and all of them come back in **one** `GetParameters` call with
`WithDecryption: true`. It runs before any AI provider is constructed.

Bundling rules:

- `sitedoc-api` (zip): `@aws-sdk/*` marked **external** — the `nodejs22.x`
  runtime ships SDK v3, and bundling it would add megabytes for nothing.
- container bundles: `@aws-sdk/*` **bundled**, because the Playwright base image
  has no AWS SDK. `playwright` is marked external so it resolves from the image's
  own `node_modules` alongside its browser.
- esbuild output is CJS and minified. `target: node22` for the zip, which runs on
  `nodejs22.x`; **`target: node20` for the container bundles**, because the
  Playwright `v1.60.0-jammy` base image ships its own Node and Node 20 is the safe
  floor. Confirm the image's actual Node version during implementation and raise
  the target if it is higher. The build toolchain's own Node version (20 in CI)
  does not affect the output.

Side benefit: these paths currently have no unit tests, only e2e coverage. Making
them framework-free makes them testable under vitest.

### 5.3 axe-core resolution in Lambda

[`src/lib/audit/accessibility.ts`](../../../src/lib/audit/accessibility.ts)
resolves axe-core at runtime from `process.cwd()/node_modules/axe-core`
(`axe.min.js` plus per-locale files). Lambda sets the working directory to
`/var/task`, so copying that single package to
`/var/task/node_modules/axe-core` in the image keeps the existing code working.

To avoid depending on that coincidence, the directory becomes overridable via
`SITEDOC_AXE_DIR`, defaulting to today's path so local behavior is unchanged.

### 5.4 Static export consequences

`next.config.ts` gains `output: "export"`. Then:

- **Delete** `src/app/api/audits/route.ts` and
  `src/app/api/artifacts/[id]/[file]/route.ts` — logic has moved to
  `src/lib/api`, and screenshots are now served directly from S3 through
  CloudFront, so they no longer pass through compute at all.
- **Delete** `src/app/report/[id]/pdf/route.ts` — becomes `lambda/pdf.ts`.
- **Replace** `src/app/report/[id]/page.tsx` with a static
  `src/app/report/page.tsx`, exported to `/report/index.html`. A dynamic segment
  under `output: "export"` requires `generateStaticParams`, which is impossible
  for arbitrary ids; the CloudFront Function rewrite means **the public URL shape
  `/report/{id}` is preserved exactly**.
- **The page stays a thin server component**, rendering a new
  `ReportClient` client component. This split is not incidental: a client
  component cannot `export const metadata`, and the server component is what
  carries the static Open Graph tags. Server components are fine under
  `output: "export"` — they render at build time; only dynamic server features
  are disallowed. So `export const dynamic = "force-dynamic"` is removed.
- `ReportClient` takes the id from `usePathname()`, fetches the record, renders
  `<ReportView>` on success, the existing `NotFoundPanel` on 404, and a skeleton
  while loading. The locale still comes from `record.language`, never from the
  viewer.
- `not-found.tsx` exports to `/404.html`, wired to the CloudFront `403` custom
  error response.
- The report page's PDF link changes from `/report/{id}/pdf` to `/pdf/{id}`.
- A static Open Graph card (a PNG in the export plus `metadata` on the report
  route) partly recovers link unfurls. It is generic, not per-report.

### 5.5 The PDF renderer

The one place static rendering makes something genuinely harder.

- No loopback. It navigates `${baseUrl}/report/{id}?print=1`, where `baseUrl`
  comes from `/sitedoc-ai/public-base-url`. CloudFront is reachable from Lambda,
  unlike Render's own external hostname.
- The report page is now client-rendered, so `waitUntil: "networkidle"` is not a
  trustworthy readiness signal. The page sets a `data-report-ready` attribute
  once its fetch resolves and `document.fonts.ready` settles; the renderer waits
  on that selector. An explicit marker, not a timing guess.
- The A4 geometry (`PDF_WIDTH_PX = 794 - 2 × 16`), `printBackground`,
  `emulateMedia({ media: "screen" })` and the self-measuring-text re-fit wait are
  carried over unchanged — they are why the fitted URL headline prints correctly.
- The in-process `pdfsInFlight` counter is replaced by a **reserved concurrency of
  2** on the function.

### 5.6 SSRF guard: unchanged, and more important

`validatePublicHttpUrl` still runs in `sitedoc-api` before a job is queued, and
`createRequestSafetyGuard` still runs per-request inside the scanner. Neither is
weakened, per the project rule. Worth stating plainly: the functions are
deliberately **not** in a VPC, so the scanner can reach the public internet and
has no path to any private network — but the guard remains the only thing
standing between a user-supplied URL and AWS internal endpoints such as the
instance metadata service.

## 6. Local development and testing

Static export means `next start` no longer exists, so local development needs a
small API host.

- **`scripts/dev-api.ts`** — a `node:http` server on port 4000 mounting the same
  `src/lib/api` functions, plus `/artifacts/*` served from `.data/`. Run with
  `tsx watch` (one new devDependency); `npm run dev` runs it alongside
  `next dev` via `concurrently`.
- **`NEXT_PUBLIC_API_BASE`** — empty in production (same origin through
  CloudFront), `http://localhost:4000` in development. The only client-side
  knowledge of where the API lives.
- Local development uses `LocalAuditStore` + `LocalArtifactStore` +
  `InProcessDispatcher`, so it needs no AWS credentials and no network.
- **Vitest** gains coverage for the new surface: `src/lib/api/*`,
  `DynamoAuditStore` (mocked SDK client, gzip round-trip, size guard),
  `S3ArtifactStore`, `SqsDispatcher`. Existing suites are unchanged.
- **Playwright e2e** — `playwright.config.ts`'s `webServer` switches from
  `npm run start` to a static server over `out/` plus the dev API. The existing
  `e2e/audit.spec.ts` flow stays valid.
- **CI** — `ci.yml` keeps lint / typecheck / test / build and runs e2e against
  the export. Node stays at 20.

## 7. Infrastructure and deploy pipeline

All infrastructure in Terraform. Nothing hand-created in the console.

```
infra/bootstrap/   one-time, applied locally: Terraform state bucket,
                   GitHub OIDC provider, deploy role
infra/             dynamodb · sqs · s3 · ecr · lambda · iam ·
                   cloudfront · ssm · logs · outputs
```

`backend.tf` uses the S3 backend with `encrypt = true` and
`use_lockfile = true` — the native S3 lockfile from Terraform 1.11, which
removes the DynamoDB lock table older guides still prescribe. (Terraform 1.11.4
is already present in the dev container.)

**Log groups are pre-created** with 14-day retention. Letting Lambda create its
own on first invocation yields unmanaged groups with never-expiring retention —
a slow, silent bill Terraform does not know exists.

**ECR lifecycle policy retains the last 3 images**, which is what holds that
storage line at ~$0.10–0.30/month rather than growing with every deploy.

### 7.1 IAM

**Three runtime roles**, one per function, each scoped to exactly the table,
bucket prefix and parameter path it needs. `sitedoc-scan` gets an explicit
`kms:Decrypt` on `alias/aws/ssm` rather than relying on the AWS-managed key's
default policy. `sitedoc-pdf` gets no write permission of any kind and no access
to the secret parameters.

**The GitHub OIDC deploy role.** No long-lived access keys in GitHub; the
workflow exchanges a short-lived OIDC token for temporary credentials via
`sts:AssumeRoleWithWebIdentity`. Two details carried over from Interview-Prepare
because they were paid for once already:

1. The `sub` claim is pinned to `repo:<owner>/<repo>:environment:production`, not
   to a branch. GitHub swaps the claim to the environment form when a job
   declares `environment:`, and matching that form is what makes the manual
   approval gate load-bearing — a future workflow omitting `environment:` could
   otherwise assume the role from `main` and skip the gate.
2. `logs` statements include **both** ARN forms:
   `log-group:/aws/lambda/x` and `log-group:/aws/lambda/x:*`. The bare form is
   required for group-level calls (`CreateLogGroup`, `PutRetentionPolicy`,
   `TagResource`); the `:*` form only matches streams.

Read actions are broadened per service while mutating actions stay explicitly
enumerated. `ssm:DescribeParameters` and `logs:DescribeLogGroups` cannot be
resource-scoped and are authorized on `*`; they return metadata only. CloudFront
has no resource-level IAM at all, so its statement is `*` on resources with a
curated action list.

### 7.2 Deploy workflow

`.github/workflows/aws-deploy.yml`, triggered on pushes to `main` touching
`src/`, `lambda/`, `infra/`, `scripts/`, `next.config.ts`, `package.json` or
`Dockerfile.lambda`. Steps are ordered so each one's prerequisites exist:

1. `npm ci` → lint, typecheck, test → `next build` (export) → esbuild the Lambda
   bundles.
2. **Manual approval gate** via `environment: production`.
3. OIDC → temporary credentials.
4. `docker build` and push to ECR, tagged with the git SHA — **before**
   `terraform apply`, because the container functions reference the tag.
5. `terraform apply`, image tag passed as a variable.
6. `aws s3 sync out/ s3://<frontend bucket> --delete` — **after** apply, since
   the bucket must exist.
7. `aws cloudfront create-invalidation --paths "/*"`.

`concurrency: { group: aws-deploy, cancel-in-progress: false }` — two applies
must never race, and queueing beats cancelling one mid-apply.

### 7.3 Bootstrap and credentials

The state bucket, OIDC provider and deploy role must exist before CI can apply
anything, which is what `infra/bootstrap/` is for: applied **once**, locally,
with a temporary credential. Every deploy after that is keyless.

The AWS CLI is not installed in the dev container and will be added.

**Credential handling.** The access key pasted into the design conversation is
considered compromised and must be deactivated and deleted. A fresh key is
created for the single bootstrap apply and may be deleted immediately afterwards
— once the OIDC role exists, nothing needs a long-lived key. No AWS credential is
committed, and none is written into Terraform variables or state.

## 8. Behavior parity

The migration changes deployment, not product. Every user-visible behavior and
where it lands:

| Behavior today | After migration |
|---|---|
| Paste URL → SSRF validation → `202` + `queued` record → client polls | Same. `validatePublicHttpUrl` untouched, still runs before queueing |
| axe-core accessibility, SEO, performance, scoring, dedup | Identical — pure `src/lib` code on the same Chromium build |
| Desktop 1440 + mobile 390 full-page screenshots | Same capture; stored in S3, edge-cached at `/artifacts/…` |
| AI enrichment, Anthropic precedence, deterministic fallback | Unchanged; keys hydrated from SSM instead of dashboard env vars |
| 5 locales; report renders in its creation language | Unchanged |
| Shareable report link `/report/{id}` | **Identical URL**, client-rendered behind a CloudFront rewrite |
| PDF download: A4, `printBackground`, screen media, fitted-URL re-fit | Same rendering logic; navigates CloudFront, waits on `data-report-ready` |
| PDF concurrency guard (in-process counter, 503 + `Retry-After`) | Reserved concurrency of 2 on `sitedoc-pdf` |
| `SITEDOC_MAX_CONCURRENT_SCANS` cap | SQS event-source `maximum_concurrency = 2` |
| Failed scan persists a `failed` record with localized summary | Unchanged, plus a DLQ for infra-level failures |
| Light-mode default, locale-stable hero, theme toggle, 404 panel | Unchanged — client code |
| Audits lost on every restart | **Improved:** durable for 30 days |
| Cold start on first visit after idle | **Improved:** no compute in the page path |

**One deliberate behavior change:** the client's poll timeout goes from 120 s to
180 s. A cold scan worker pulls the container image before it starts, and it is
better to absorb that than to have the UI give up on a scan that is still
running.

## 9. Cutover and rollback

Render stays live and untouched until AWS is verified.

1. Bootstrap apply, then the first full deploy. Neither touches Render traffic.
2. Smoke test on the CloudFront URL: run a real audit end to end, verify both
   screenshots render, download the PDF, check all five locales, confirm an
   intentionally failing audit still reports a localized failure, and confirm a
   report link survives a hard reload.
3. Measure the first-scan cold start and the warm page load; record both.
4. Only then delete `render.yaml` and the Render-specific `Dockerfile`, in their
   own commit, and delete the Render service.

**Rollback** before step 4 is "keep using the Render URL" — nothing to undo.
After step 4 it is a revert plus a Render blueprint re-apply.

## 10. Cost model

| Service | Allowance | Permanent? |
|---|---|---|
| Lambda | 1M requests + 400,000 GB-seconds/month | **Always free** |
| CloudFront | 1 TB egress + 10M requests/month | **Always free** |
| DynamoDB | 25 GB storage, on-demand requests | **Always free** |
| SQS | 1M requests/month | **Always free** |
| SSM Parameter Store (standard) | unlimited | **Always free** |
| CloudWatch Logs | 5 GB ingest/month | **Always free** |
| S3 | 5 GB standard storage | 12 months only |
| ECR private storage | 500 MB | 12 months only → then ~$0.10/GB-month |

Steady state after the first year: **well under $1/month**, with ECR storage and
a few cents of S3 the only possible line items.

Cost decisions that were structural rather than incidental: no NAT gateway
(~$32/month by itself), no ALB, no always-on compute, no VPC for Lambda,
Function URLs instead of API Gateway, Parameter Store instead of Secrets
Manager, TTL-based expiry instead of a cleanup Lambda, 14-day log retention, and
`PriceClass_100`.

## 11. Risks and open verifications

Things to prove during implementation rather than assume:

1. **CloudFront OAC signing for `POST` bodies** to a Lambda Function URL.
   Fallback: `auth_type = NONE` plus a CloudFront-injected secret header
   validated in the handler.
2. **Playwright base image + Lambda Runtime Interface Client.** `aws-lambda-ric`
   compiles with node-gyp, so the builder stage needs `cmake`, `g++`, `make` and
   `python3`. Verify locally with the Runtime Interface Emulator before pushing.
3. **Next 16 `output: "export"`** with the client-rendered report page and
   `next/font/google` self-hosting.
4. **The `/report*` CloudFront Function rewrite** coexisting with the `403 →
   /404.html` custom error response.
5. **First-scan cold start** with a large image. Measure; slim the image if it
   exceeds a few seconds.

Accepted gaps, stated rather than hidden:

- No point-in-time recovery on DynamoDB, no CloudWatch alarms, no billing alarm,
  no distributed tracing. Appropriate for a portfolio project with a 30-day
  retention window; each would be non-negotiable for real customer data.
- Single region.
- `terraform apply` runs on merge to `main` behind a manual gate; there is no
  `terraform plan` on pull requests yet.

## 12. Implementation phasing

This is a large change, so it is ordered into phases that each end in a working,
verifiable state. Nothing in a later phase is required to validate an earlier one.

1. **Adapters and seams, no AWS.** `ArtifactStore` interface + local
   implementation, `AuditDispatcher` + `InProcessDispatcher`, `SITEDOC_AXE_DIR`,
   remove SQLite. The app still runs exactly as today on Render; tests prove it.
2. **Framework-free handlers.** Extract `src/lib/api/audits.ts`, add its unit
   tests, keep the Next routes as thin callers. Still deployable to Render.
3. **Static export + local dev host.** `output: "export"`, report page split,
   `scripts/dev-api.ts`, PDF link change, e2e and CI updated. This is the phase
   that breaks Render compatibility, so it lands as one coherent step.
4. **AWS adapters.** `DynamoAuditStore`, `S3ArtifactStore`, `SqsDispatcher`,
   `lambda/*` handlers, `lambda/secrets.ts`, `esbuild.config.mjs`,
   `Dockerfile.lambda` verified locally with the Runtime Interface Emulator.
5. **Infrastructure.** `infra/bootstrap/` then `infra/`, applied manually to a
   real account. Verifies the OAC-with-`POST` question early.
6. **Deploy pipeline.** `aws-deploy.yml` with OIDC and the approval gate.
7. **Cutover.** Smoke test per section 9, docs updated, Render decommissioned.

## 13. Definition of done

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and the e2e
  suite all pass.
- A `code-reviewer` pass has been run over the change.
- The section 8 parity table has been verified item by item against the deployed
  CloudFront URL.
- `README.md` and `AGENTS.md` describe the AWS architecture and deployment.
- Render is decommissioned and `render.yaml` removed.
- **No commits are made by the agent.** The work is handed to the maintainer for
  review and commit.
