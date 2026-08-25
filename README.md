<!-- The YAML block below configures a Hugging Face Docker Space (ignored elsewhere). -->
---
title: SiteDoc AI
emoji: 🛰️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 3000
pinned: false
---

# SiteDoc AI

SiteDoc AI is an AI-assisted website QA dashboard for generating developer-ready audit reports across accessibility, performance, SEO, and UX quality. It features a "Pop Sheet" cartoon-poster UI — cream paper, inked outlines, hard offset shadows, sunburst hero — with light and dark themes, and a score-driven celestial grade (the better the score, the grander the body — Moon → … → Galaxy). Available in 5 languages.

The current version includes a real Playwright scanner: submit a public URL, launch Chromium, capture desktop and mobile screenshots, collect console errors and failed network requests, save local audit artifacts, and review the generated report in the dashboard.

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- ESLint
- Playwright
- Vitest + Testing Library

## Internationalization

The UI, the deterministic audit content (summaries, issue titles/fixes, metrics), **and the AI remediation report** are localized in **English, Vietnamese, Spanish, Chinese, and Japanese** via a header language switcher. The chosen language is sent with each audit and stored on the report, so AI-generated feedback is produced in the page's language. See `src/i18n/`.

## AI Remediation Layer

Completed audits are enriched with an AI-generated remediation report — an executive summary, prioritized issues, recommended actions, and UX suggestions — produced in the page's language. AI is accessed only through the `@/lib/ai` provider abstraction, which selects a provider by whichever API key is present:

- **Claude** (`ANTHROPIC_API_KEY`, preferred): default model `claude-opus-4-8` (override `SITEDOC_AI_MODEL`), via a forced structured-output tool call.
- **OpenAI** (`OPENAI_API_KEY`, used when no Anthropic key is set): default model `gpt-4o-mini` (override `SITEDOC_OPENAI_MODEL`), via Structured Outputs.
- **Deterministic fallback** (no key, or any error/timeout): a report built from the audit data and localized templates, so a report is always returned and the audit never blocks.

Copy `.env.example` to `.env.local` to configure. All variables are optional.

## Shareable Reports & PDF Export

Every completed audit gets a server-rendered, read-only page at **`/report/{id}`** that
renders in the language the audit was created in (independent of the viewer's language
switcher). From the dashboard, **Copy link** / **Open report** share it; from the report
page, **Download PDF** returns a real PDF file — the server renders the print-optimized
view (`?print=1`) over the internal loopback with the same Chromium the scanner uses.
Reports are read from the `AuditStore`, so a database-backed store will make them durable
across deploys without any change to these pages.

## Getting Started

> **Requires Node 20+** (Next.js 16). If your shell defaults to an older Node, run `nvm use 20`.

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

That starts two processes: `next dev` on [http://localhost:3000](http://localhost:3000)
for the UI, and the API host on port 4000. The frontend is a static export, so the API
cannot live inside Next any more — the client finds it through `NEXT_PUBLIC_API_BASE`
(set to `http://localhost:4000` in `.env.development`, empty in production where both
share one CloudFront origin).

## Available Scripts

```bash
npm run dev           # next dev + the local API host (ports 3000 and 4000)
npm run dev:api       # just the API host, on port 4000
npm run serve:local   # serve out/ + the API on port 3000 (stand-in for CloudFront)
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm test              # Vitest (unit/component)
npm run test:watch    # Vitest in watch mode
npm run build         # static export to out/ (also type-checks)
npm run bundle:lambda # esbuild the Lambda handlers into dist-lambda/
npm run test:e2e      # Playwright end-to-end smoke test (run `npm run build` first)
```

The verification gate before completing a change is: `lint`, `typecheck`, `test`, `build`.

## MVP Features

- URL audit form (audit-module toggles are shown; selection wiring is planned)
- Public URL validation with local/private network blocking
- Playwright-powered desktop and mobile screenshot capture
- Browser console error collection
- Failed network request and HTTP 4xx/5xx collection
- Local JSON audit records under `.data/audits`
- Local screenshot artifacts under `.data/audit-artifacts` (served at `/artifacts/*`)
- Scanner, console, network, and overall scorecards
- Categorized issue list with severity labels and remediation guidance
- Responsive dashboard layout

## Project Structure

```text
src/app/                 Pages (App Router, statically exported)
src/lib/api/             Framework-free request handlers (audits, PDF)
src/lib/audit-types.ts   Core audit data model
src/lib/audit/scoring.ts Pure scoring helpers (unit-tested)
src/lib/audit/dispatch.ts      AuditDispatcher: in-process queue or SQS
src/lib/playwright-scanner.ts  Playwright scan orchestration
src/lib/url-validation.ts      SSRF guard for public URLs
src/lib/store/           AuditStore + ArtifactStore, local / DynamoDB / S3
lambda/                  Lambda entry points (api, scan, pdf) — plumbing only
scripts/local-server.ts  Local stand-in for the deployed edge
esbuild.config.mjs       Bundles the Lambda handlers
Dockerfile.lambda        Chromium image for the scan and PDF functions
```

Nothing in `src/lib` knows about AWS except three adapters. Records go through
`AuditStore`, screenshots through `ArtifactStore`, and background work through
`AuditDispatcher`; each has a local implementation and a cloud one, selected by
environment variable. The Lambda handlers and the local server are both thin callers
over `src/lib/api`.

## Credits

The celestial grade artwork (`public/textures/planets/`) was supplied by the project
maintainer; the per-tier cutouts in `sprites/` are derived from it. See
[`public/textures/planets/sprites/SOURCE.md`](public/textures/planets/sprites/SOURCE.md)
for how they are produced — **the origin and licence of the two source images are not
recorded and need confirming before public release.**

## Roadmap

The full phased roadmap and the original design direction (accessibility/SEO/performance
engines, AI remediation, shareable reports, deployment) live in
[`docs/superpowers/specs/2026-06-11-sitedoc-ai-roadmap-design.md`](docs/superpowers/specs/2026-06-11-sitedoc-ai-roadmap-design.md).
That spec's UI section is historical: the "Aurora Glass" glassmorphism system and the
WebGL celestial hero it describes were replaced by the Pop Sheet design and flat sticker
artwork.

Shipped: Pop Sheet design system (light + dark) + celestial score grade · **axe-core accessibility engine** · **deterministic SEO + performance checks** (categorized, scored, localized) · **AI remediation layer** (Claude or OpenAI + deterministic fallback, localized) · **shareable `/report/{id}` pages + one-click PDF export** · **async job model + containerized deploy + CI/E2E** · 5-language i18n.

Upcoming:

- AWS infrastructure as Terraform, a keyless OIDC deploy workflow, and the Render
  decommission — see
  [`docs/superpowers/specs/2026-08-05-aws-migration-design.md`](docs/superpowers/specs/2026-08-05-aws-migration-design.md)

## Async Audit Jobs

Submitting a URL returns immediately (`202`) with a `queued` record; the Playwright scan
and AI enrichment run in the background, and the UI polls `GET /api/audits?id=` through
`queued → running → completed`. This keeps requests fast and decouples the heavy work from
the response.

How that background work is started is behind the `AuditDispatcher` seam: an in-process
concurrency queue by default (dev and tests need no AWS), or SQS with
`SITEDOC_DISPATCH=sqs`, which the deployed API uses because Lambda freezes execution once
the response is sent. The queue path also gains retries and a dead-letter queue.

## Storage

Audit records are accessed only through the `AuditStore` abstraction:

- **Local JSON** (default): `.data/audits/{auditId}.json`.
- **DynamoDB** (`AUDIT_STORE=dynamo`, table from `SITEDOC_TABLE`): one gzipped item per
  audit with a 30-day TTL. Oversized records shed console noise, then failed requests,
  then the least severe issues, rather than failing the write.

Screenshots go through the matching `ArtifactStore` abstraction:

- **Local disk** (default): `.data/audit-artifacts/{auditId}/{desktop,mobile}.png`.
- **S3** (`SITEDOC_ARTIFACTS=s3`, bucket from `SITEDOC_ARTIFACT_BUCKET`): staged in `/tmp`,
  uploaded under `audits/{auditId}/`, immutably cached.

Both serve at `/artifacts/{auditId}/{file}`, so dev and production share one URL shape.
All `.data` paths are git-ignored.

## Deployment

The target is a static frontend on S3 behind CloudFront, with three Lambda functions
behind the same origin — so there is no compute in the page path and no cold start on
first paint:

| Piece | Runs as | Serves |
|---|---|---|
| Frontend | static export in `out/`, on S3 | `/`, `/report/{id}` (rewritten to the exported shell) |
| `sitedoc-api` | zip, `nodejs22.x`, 360 KB bundle | `/api/audits` |
| `sitedoc-scan` | container image (`Dockerfile.lambda`) | SQS messages from the API |
| `sitedoc-pdf` | same image, different command | `/pdf/{id}` |
| Screenshots | S3, edge-cached | `/artifacts/{id}/{file}` |

Build the pieces locally:

```bash
npm run build           # static export → out/
npm run bundle:lambda   # handlers → dist-lambda/{api,scan,pdf}/index.js
docker build -f Dockerfile.lambda -t sitedoc-browser:local .
```

The image is based on the same `playwright:v1.60.0-jammy` build as before, because audit
output is browser-dependent: a different Chromium silently changes the scores. Secrets are
read from SSM Parameter Store at cold start (`SSM_PREFIX`); without it the functions use
plain environment variables, which is what local development does.

`npm run serve:local` approximates the CloudFront routing table on one port, and is what
the e2e suite runs against. CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit
tests, build, and the Playwright E2E on every push/PR.

Provisioning the AWS side requires **Terraform 1.11+, AWS CLI v2 and Docker**. The
infrastructure is two Terraform stacks: `infra/bootstrap/` (applied once by hand — remote
state bucket, GitHub OIDC provider, deploy role, ECR repository) and `infra/` (everything
else, applied by the deploy pipeline).

> ⚠️ **`infra/bootstrap/` has no remote backend.** Its state is the gitignored
> `infra/bootstrap/terraform.tfstate` on whichever machine ran the first `apply` —
> the usual chicken-and-egg, since that stack creates the very bucket the other
> stack keeps its state in. Fourteen live resources are tracked there, including
> the GitHub OIDC provider, the `sitedoc-deploy` role and the `sitedoc-browser`
> ECR repository.
>
> **That file is not reproducible.** Lose it and those resources still exist but
> are unmanaged: Terraform will try to create them again, fail on "already
> exists", and each one has to be `terraform import`ed back by hand.
>
> The permanent fix is to move it into the bucket it already created, which is
> versioned and encrypted:
>
> ```hcl
> # infra/bootstrap/versions.tf, inside the existing terraform { } block
> backend "s3" {
>   bucket  = "sitedoc-tfstate-403001213633"
>   key     = "bootstrap/terraform.tfstate"
>   region  = "us-east-1"
>   encrypt = true
> }
> ```
>
> ```bash
> terraform -chdir=infra/bootstrap init -migrate-state
> ```
>
> Terraform copies the local state up and leaves a `.tfstate.backup` behind.
> After that the stack is reproducible on any machine with credentials.

## Picking this up on another machine

`git clone`, `npm install`, `npm run dev` — that is the whole setup. Nothing here
is machine-bound except the Terraform bootstrap state described above.

- **No secrets are required to run it.** Every variable in `.env.example` is
  optional; with no key present the AI layer falls back to a deterministic report
  and the app works fully. Add `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) to
  `.env.local` to turn the remediation layer back on — issue a fresh key rather
  than carrying one across.
- **Deployed functions read config from SSM Parameter Store** (`SSM_PREFIX`), so
  the running stack does not depend on what any laptop holds.
- **CI stores no AWS keys** — the deploy path authenticates through the GitHub
  OIDC provider created by the bootstrap stack.
- **`.data/` and `public/audit-artifacts/`** are gitignored scratch output from
  local scans, regenerated by running one. Nothing there needs keeping.

The OIDC deploy workflow and the Render decommission are the next phase; until
they land, `Dockerfile` and `render.yaml` describe the previous container deploy and no
longer match the app (`next start` is gone under a static export).
