# SiteDoc AI — AWS Migration, Part 1: Application Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-08-05-aws-migration-design.md`](../specs/2026-08-05-aws-migration-design.md)

**Goal:** Refactor SiteDoc AI so it can run as a static frontend plus three AWS
Lambda functions, verifying every step locally, without provisioning any AWS
infrastructure.

**Architecture:** Three new storage/dispatch adapters slot behind existing (or
new) interfaces so `src/lib` never learns about AWS. The Next.js route handler
bodies move into framework-free functions in `src/lib/api`, which are then called
by both thin Lambda handlers in `lambda/` and a local development HTTP server.
Finally Next.js switches to `output: "export"`.

**Tech Stack:** Next.js 16 (static export), TypeScript, Playwright, Vitest,
esbuild, AWS SDK v3, Docker.

**Scope boundary:** This plan covers spec phases 1–4. Everything here is
verifiable on a laptop. Terraform, GitHub OIDC, the deploy workflow and the
Render cutover are spec phases 5–7 and live in a separate plan
(`2026-08-05-aws-migration-infrastructure.md`).

---

## Global Constraints

Copied verbatim from the spec and project rules. Every task's requirements
implicitly include this section.

- **Do NOT commit.** The maintainer reviews and commits. Every task ends with
  `git add`, never `git commit`. (`CLAUDE.md`)
- **Verification gate for any substantial change:** `npm run lint`,
  `npm run typecheck`, `npm test`, `npm run build`.
- **Lint must be run as `./node_modules/.bin/eslint .`** — wrapper scripts
  misbehave in this environment.
- **Node 20+** is required. If `node --version` reports 18, run `nvm use default`.
- **Do not weaken the SSRF guard** in `@/lib/url-validation`.
- **Storage is reached only through the `AuditStore` abstraction** (`@/lib/store`).
- **All five locales (en/vi/es/zh/ja) stay in sync.** UI dictionaries in
  `src/i18n/dictionaries/` are typed against `en`; audit content lives in
  `src/lib/audit/audit-i18n.ts`. User-facing text must match the page's language.
- **Region:** `us-east-1`. **Retention:** 30 days.
- **Chromium must stay the Playwright `v1.60.0-jammy` build** — audit scores are
  browser-dependent.
- **`AWS_REGION` is never set as a user environment variable** on a Lambda; it is
  reserved and injected by the runtime.
- **After the last task, invoke the `code-reviewer` subagent** before declaring
  the plan complete.

**Artifact URL sequencing (important, easy to get wrong):** `ArtifactStore.urlFor`
returns `/api/artifacts/<id>/<file>` in Phase 1 so the existing Next route keeps
serving screenshots and the app stays working. It flips to `/artifacts/<id>/<file>`
in Task 11, at the same moment the local server takes over serving them. Do not
flip it early.

---

# Phase 1 — Adapters and seams, no AWS

At the end of this phase the app behaves exactly as it does today and is still
deployable to Render.

---

### Task 1: `ArtifactStore` interface and local implementation

Screenshots are currently reached through two bare path helpers exported from
`local-store.ts` with no abstraction. This task introduces the interface that
`S3ArtifactStore` will later implement, without changing behavior.

**Files:**
- Create: `src/lib/store/artifact-types.ts`
- Create: `src/lib/store/local-artifact-store.ts`
- Create: `src/lib/store/local-artifact-store.test.ts`
- Modify: `src/lib/store/index.ts` (add `artifactStore` export)
- Modify: `src/lib/store/local-store.ts:47-58` (remove the two path helpers)
- Modify: `src/lib/playwright-scanner.ts:12-15,313-395` (consume the store)

**Interfaces:**
- Produces:
  - `interface ArtifactStore { stagingDirectory(auditId: string): string; publish(auditId: string, files: string[]): Promise<void>; urlFor(auditId: string, file: string): string; }`
  - `class LocalArtifactStore implements ArtifactStore` — constructor
    `(root?: string)`, defaulting to `<cwd>/.data/audit-artifacts`.
  - `export const artifactStore: ArtifactStore` from `@/lib/store`.
- Consumes: nothing from earlier tasks.

- [x] **Step 1: Write failing test**

  Create `src/lib/store/local-artifact-store.test.ts`:

  ```ts
  import { mkdtemp } from "node:fs/promises";
  import { tmpdir } from "node:os";
  import path from "node:path";
  import { describe, expect, it } from "vitest";
  import { LocalArtifactStore } from "@/lib/store/local-artifact-store";

  describe("LocalArtifactStore", () => {
    it("stages files in a per-audit directory under the configured root", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "sitedoc-artifacts-"));
      const store = new LocalArtifactStore(root);

      expect(store.stagingDirectory("abc")).toBe(path.join(root, "abc"));
    });

    it("publish is a no-op because staged files are already final", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "sitedoc-artifacts-"));
      const store = new LocalArtifactStore(root);

      await expect(store.publish("abc", ["desktop.png"])).resolves.toBeUndefined();
    });

    it("serves artifacts through the existing route so behavior is unchanged", () => {
      const store = new LocalArtifactStore("/tmp/whatever");

      expect(store.urlFor("abc", "desktop.png")).toBe("/api/artifacts/abc/desktop.png");
    });
  });
  ```

- [x] **Step 2: Run test and verify it fails**

  Run: `npx vitest run src/lib/store/local-artifact-store.test.ts`
  Expected: FAIL — `Failed to resolve import "@/lib/store/local-artifact-store"`.

- [x] **Step 3: Write the interface**

  Create `src/lib/store/artifact-types.ts`:

  ```ts
  /**
   * Storage abstraction for audit screenshots. The scanner writes PNGs into
   * `stagingDirectory()` and then calls `publish()` once; where the bytes end up
   * is the implementation's business. `urlFor()` returns the path the browser
   * uses, which is why both implementations agree on one URL shape.
   */
  export interface ArtifactStore {
    /** Directory the scanner writes PNGs into. Must exist after `mkdir`. */
    stagingDirectory(auditId: string): string;
    /** Move staged files to their durable home. Called once, after capture. */
    publish(auditId: string, files: string[]): Promise<void>;
    /** Public URL for a published artifact. */
    urlFor(auditId: string, file: string): string;
  }
  ```

- [x] **Step 4: Write the local implementation**

  Create `src/lib/store/local-artifact-store.ts`:

  ```ts
  import path from "node:path";
  import type { ArtifactStore } from "@/lib/store/artifact-types";

  /**
   * Filesystem-backed {@link ArtifactStore}. Screenshots live under `.data/`
   * (NOT `public/`): Next's production server only serves files that existed in
   * `public/` at build time, so runtime-written screenshots there 404.
   *
   * `publish` is a no-op — the scanner has already written the bytes to their
   * final location, which is exactly the property S3 does not have.
   */
  export class LocalArtifactStore implements ArtifactStore {
    private readonly root: string;

    constructor(root: string = path.join(process.cwd(), ".data", "audit-artifacts")) {
      this.root = root;
    }

    stagingDirectory(auditId: string): string {
      return path.join(this.root, auditId);
    }

    async publish(): Promise<void> {
      // Nothing to do: staged files are already final.
    }

    urlFor(auditId: string, file: string): string {
      return `/api/artifacts/${auditId}/${file}`;
    }
  }
  ```

- [x] **Step 5: Run test and verify it passes**

  Run: `npx vitest run src/lib/store/local-artifact-store.test.ts`
  Expected: PASS (3 tests).

- [x] **Step 6: Export `artifactStore` from the store barrel**

  In `src/lib/store/index.ts`, delete the `getAuditArtifactDirectory` /
  `getAuditArtifactUrl` re-export block and add:

  ```ts
  import { LocalArtifactStore } from "@/lib/store/local-artifact-store";
  import type { ArtifactStore } from "@/lib/store/artifact-types";

  export type { ArtifactStore } from "@/lib/store/artifact-types";

  /**
   * The active artifact store. Local disk by default; `SITEDOC_ARTIFACTS=s3`
   * selects object storage (added with the S3 implementation).
   *
   * Bracket access, for the same reason as `AUDIT_STORE` below: dot access gets
   * inlined at build time and would freeze the selection.
   */
  export const artifactStore: ArtifactStore = new LocalArtifactStore();
  ```

- [x] **Step 7: Delete the old path helpers**

  In `src/lib/store/local-store.ts`, delete everything from the
  `// --- Local screenshot artifact helpers ---` comment to end of file
  (the `artifactRoot` const and both exported functions).

- [x] **Step 8: Rewire the scanner**

  In `src/lib/playwright-scanner.ts`, change the `@/lib/store` import (lines
  12–15) to:

  ```ts
  import { artifactStore } from "@/lib/store";
  ```

  In `runPlaywrightScan` replace line 315:

  ```ts
  const artifactDirectory = artifactStore.stagingDirectory(options.auditId);
  ```

  After the second `captureViewport` call (the mobile capture, ~line 334) add:

  ```ts
  // Hand the captured PNGs to the artifact store. Local disk is already done;
  // S3 uploads here. The scanner deliberately does not know which.
  await artifactStore.publish(options.auditId, ["desktop.png", "mobile.png"]);
  ```

  In the returned record's `screenshots` block (~line 386) replace both
  `getAuditArtifactUrl(...)` calls:

  ```ts
  screenshots: {
    desktop: artifactStore.urlFor(options.auditId, "desktop.png"),
    mobile: artifactStore.urlFor(options.auditId, "mobile.png"),
  },
  ```

- [x] **Step 9: Fix any remaining references**

  Run: `./node_modules/.bin/eslint . && npm run typecheck`
  Expected: no errors. If `getAuditArtifactDirectory` or `getAuditArtifactUrl`
  is still referenced anywhere (the artifacts route handler is the likely one),
  update it to use `artifactStore.stagingDirectory(...)`.

- [x] **Step 10: Run the full unit suite**

  Run: `npm test`
  Expected: PASS. The scanner's own tests must be unchanged — if one needed
  editing, the abstraction leaked and Step 8 is wrong.

- [x] **Step 11: Stage (do NOT commit)**

  ```bash
  git add src/lib/store src/lib/playwright-scanner.ts
  ```

---

### Task 2: Make the axe-core directory overridable

`accessibility.ts` resolves axe-core from `process.cwd()/node_modules/axe-core`.
That happens to work in Lambda (cwd is `/var/task`), but depending on a
coincidence is not a design. This makes it explicit with no behavior change.

**Files:**
- Modify: `src/lib/audit/accessibility.ts:25,34-45`
- Create: `src/lib/audit/accessibility-axe-dir.test.ts`

**Interfaces:**
- Produces: `SITEDOC_AXE_DIR` environment variable, defaulting to
  `<cwd>/node_modules/axe-core`. Consumed by `Dockerfile.lambda` in Task 16.

- [x] **Step 1: Write failing test**

  Create `src/lib/audit/accessibility-axe-dir.test.ts`:

  ```ts
  import path from "node:path";
  import { afterEach, describe, expect, it, vi } from "vitest";

  async function loadAxeDir() {
    vi.resetModules();
    const mod = await import("@/lib/audit/accessibility");
    return mod.axeDirectory();
  }

  afterEach(() => {
    delete process.env.SITEDOC_AXE_DIR;
  });

  describe("axeDirectory", () => {
    it("defaults to the installed package under the working directory", async () => {
      expect(await loadAxeDir()).toBe(
        path.join(process.cwd(), "node_modules", "axe-core"),
      );
    });

    it("honors SITEDOC_AXE_DIR so the Lambda image can relocate it", async () => {
      process.env.SITEDOC_AXE_DIR = "/var/task/node_modules/axe-core";
      expect(await loadAxeDir()).toBe("/var/task/node_modules/axe-core");
    });
  });
  ```

- [x] **Step 2: Run test and verify it fails**

  Run: `npx vitest run src/lib/audit/accessibility-axe-dir.test.ts`
  Expected: FAIL — `axeDirectory is not a function`.

- [x] **Step 3: Implement**

  In `src/lib/audit/accessibility.ts`, replace line 25:

  ```ts
  /**
   * Directory holding the installed axe-core package. Overridable because the
   * Lambda container image copies only this one package to `/var/task`, and
   * relying on `process.cwd()` there would be an accident rather than a contract.
   *
   * Read at call time, not module load, so tests can vary it.
   */
  export function axeDirectory(): string {
    return (
      process.env["SITEDOC_AXE_DIR"] ??
      path.join(process.cwd(), "node_modules", "axe-core")
    );
  }
  ```

  Then replace every use of the old `AXE_SCRIPT` constant with
  `path.join(axeDirectory(), "axe.min.js")`, and in `loadAxeLocale` replace the
  `readFile` path argument with:

  ```ts
  path.join(axeDirectory(), "locales", file),
  ```

- [x] **Step 4: Run test and verify it passes**

  Run: `npx vitest run src/lib/audit/accessibility-axe-dir.test.ts`
  Expected: PASS (2 tests).

- [x] **Step 5: Verify the real accessibility suite still passes**

  Run: `npx vitest run src/lib/audit`
  Expected: PASS — the default path is unchanged, so nothing else moves.

- [x] **Step 6: Stage (do NOT commit)**

  ```bash
  git add src/lib/audit/accessibility.ts src/lib/audit/accessibility-axe-dir.test.ts
  ```

---

### Task 3: `AuditDispatcher` seam

`enqueueAudit` runs work in-process after the response returns. Serverless
freezes that. This introduces the seam; `SqsDispatcher` arrives in Task 12.

**Files:**
- Create: `src/lib/audit/dispatch.ts`
- Create: `src/lib/audit/dispatch.test.ts`
- Modify: `src/lib/audit/job-queue.ts:124-175`
- Modify: `src/app/api/audits/route.ts:50`

**Interfaces:**
- Produces:
  - `interface AuditDispatcher { dispatch(job: AuditJob): Promise<void>; }`
  - `class InProcessDispatcher implements AuditDispatcher` — constructor
    `(queue: ConcurrencyQueue, deps: RunAuditDeps)`.
  - `export const auditDispatcher: AuditDispatcher` from `@/lib/audit/dispatch`.
  - `export const productionDeps: RunAuditDeps` from `@/lib/audit/job-queue`
    (currently module-private; **must be exported** — Task 15's SQS worker needs it).
  - `enqueueAudit(job: AuditJob): Promise<void>` — **now async**.
- Consumes: `runAuditJob`, `ConcurrencyQueue`, `AuditJob`, `RunAuditDeps` from
  `@/lib/audit/job-queue` (all pre-existing and unmodified).

- [x] **Step 1: Write failing test**

  Create `src/lib/audit/dispatch.test.ts`:

  ```ts
  import { describe, expect, it, vi } from "vitest";
  import { ConcurrencyQueue, type AuditJob, type RunAuditDeps } from "@/lib/audit/job-queue";
  import { InProcessDispatcher } from "@/lib/audit/dispatch";

  const job: AuditJob = {
    auditId: "11111111-1111-4111-8111-111111111111",
    url: "https://example.com/",
    language: "en",
    startedAt: "2026-08-05T00:00:00.000Z",
  };

  function deps(overrides: Partial<RunAuditDeps> = {}): RunAuditDeps {
    return {
      save: vi.fn().mockResolvedValue(undefined),
      scan: vi.fn().mockResolvedValue({ status: "completed" }),
      enrich: vi.fn(async (record) => record),
      now: () => "2026-08-05T00:00:01.000Z",
      ...overrides,
    } as RunAuditDeps;
  }

  describe("InProcessDispatcher", () => {
    it("returns before the job finishes so the response is not blocked", async () => {
      let released: (() => void) | undefined;
      const scan = vi.fn(
        () => new Promise((resolve) => { released = () => resolve({ status: "completed" }); }),
      );
      const d = deps({ scan: scan as unknown as RunAuditDeps["scan"] });
      const dispatcher = new InProcessDispatcher(new ConcurrencyQueue(1), d);

      await dispatcher.dispatch(job);

      expect(scan).toHaveBeenCalledOnce();
      expect(d.save).toHaveBeenCalledOnce(); // only the "running" skeleton so far
      released?.();
    });

    it("runs the job through runAuditJob, saving the final record", async () => {
      const d = deps();
      const dispatcher = new InProcessDispatcher(new ConcurrencyQueue(1), d);

      await dispatcher.dispatch(job);
      await vi.waitFor(() => expect(d.save).toHaveBeenCalledTimes(2));

      expect(d.enrich).toHaveBeenCalledOnce();
    });
  });
  ```

- [x] **Step 2: Run test and verify it fails**

  Run: `npx vitest run src/lib/audit/dispatch.test.ts`
  Expected: FAIL — cannot resolve `@/lib/audit/dispatch`.

- [x] **Step 3: Implement the dispatcher**

  Create `src/lib/audit/dispatch.ts`:

  ```ts
  import {
    ConcurrencyQueue,
    productionDeps,
    runAuditJob,
    type AuditJob,
    type RunAuditDeps,
  } from "@/lib/audit/job-queue";

  /**
   * How an audit job gets from the request handler to the thing that runs it.
   *
   * In a long-lived process that is an in-memory queue. On Lambda it has to be
   * a real queue, because execution freezes once the response is sent — which is
   * the single assumption that makes the container design unportable.
   */
  export interface AuditDispatcher {
    dispatch(job: AuditJob): Promise<void>;
  }

  /** Runs jobs in this process, bounded by a concurrency queue. */
  export class InProcessDispatcher implements AuditDispatcher {
    constructor(
      private readonly queue: ConcurrencyQueue,
      private readonly deps: RunAuditDeps,
    ) {}

    async dispatch(job: AuditJob): Promise<void> {
      // Deliberately not awaited: `dispatch` resolves once the job is accepted,
      // not once it completes.
      void this.queue.add(() => runAuditJob(job, this.deps));
    }
  }

  const MAX_CONCURRENT_SCANS = Number(process.env.SITEDOC_MAX_CONCURRENT_SCANS) || 2;

  export const auditDispatcher: AuditDispatcher = new InProcessDispatcher(
    new ConcurrencyQueue(MAX_CONCURRENT_SCANS),
    productionDeps,
  );
  ```

- [x] **Step 4: Export `productionDeps` and delegate `enqueueAudit`**

  In `src/lib/audit/job-queue.ts`, change `const productionDeps: RunAuditDeps =`
  to `export const productionDeps: RunAuditDeps =`, then delete the
  `MAX_CONCURRENT_SCANS`/`queue` constants and replace `enqueueAudit` with:

  ```ts
  /**
   * Enqueue an audit to run in the background. Returns once the job is accepted,
   * not once it finishes; progress is observed by polling the audit record.
   */
  export async function enqueueAudit(job: AuditJob): Promise<void> {
    const { auditDispatcher } = await import("@/lib/audit/dispatch");
    await auditDispatcher.dispatch(job);
  }
  ```

  The dynamic import breaks the cycle (`dispatch` imports `productionDeps` from
  `job-queue`). Keep it dynamic — a static import here is a circular-import bug
  that only shows up at runtime.

- [x] **Step 5: Await it at the call site**

  In `src/app/api/audits/route.ts` line 50, change `enqueueAudit(job);` to:

  ```ts
  await enqueueAudit(job);
  ```

- [x] **Step 6: Run tests**

  Run: `npx vitest run src/lib/audit && npm run typecheck`
  Expected: PASS. Existing `job-queue` tests must be untouched.

- [x] **Step 7: Manually verify an audit still runs end to end**

  ```bash
  npm run dev
  ```
  Then in a second shell:
  ```bash
  curl -s -X POST localhost:3000/api/audits \
    -H 'content-type: application/json' \
    -d '{"url":"https://example.com","language":"en"}' | head -c 200
  ```
  Expected: a `202` JSON body with `"status":"queued"`. Poll
  `curl -s "localhost:3000/api/audits?id=<id>"` until `"status":"completed"`.

- [x] **Step 8: Stage (do NOT commit)**

  ```bash
  git add src/lib/audit/dispatch.ts src/lib/audit/dispatch.test.ts \
    src/lib/audit/job-queue.ts src/app/api/audits/route.ts
  ```

---

### Task 4: Remove SQLite

A Lambda has no persistent disk and `/tmp` is not shared between functions, so
`SqliteAuditStore` cannot store production records under any serverless design.
Its only remaining role would be keeping a native module compiling in CI and in
the container image.

**Files:**
- Delete: `src/lib/store/sqlite-store.ts`
- Delete: `src/lib/store/sqlite-store.test.ts` (if present)
- Modify: `src/lib/store/index.ts`
- Modify: `package.json` (drop `better-sqlite3`, `@types/better-sqlite3`)
- Modify: `render.yaml` (drop `AUDIT_STORE=sqlite`)
- Modify: `Dockerfile` (drop any SQLite build dependency)

**Interfaces:**
- Produces: `auditStore` now resolves `AUDIT_STORE=dynamo` (Task 10) or falls back
  to `LocalAuditStore`. The `"sqlite"` value is no longer recognized.

- [x] **Step 1: Confirm what exists before deleting**

  ```bash
  ls src/lib/store/
  grep -rn "sqlite\|better-sqlite3" --include='*.ts' --include='*.tsx' \
    --include='*.json' --include='*.yaml' --include='Dockerfile' . \
    | grep -v node_modules
  ```
  Record every hit; each one must be resolved by Step 4.

- [x] **Step 2: Delete the implementation and its test**

  ```bash
  git rm src/lib/store/sqlite-store.ts
  git rm --ignore-unmatch src/lib/store/sqlite-store.test.ts
  ```

- [x] **Step 3: Simplify the store selector**

  In `src/lib/store/index.ts`, remove the `SqliteAuditStore` import and replace
  the selector and its comment with:

  ```ts
  /**
   * The active audit store. Defaults to the local filesystem JSON store (no
   * native deps in dev/tests); `AUDIT_STORE=dynamo` selects DynamoDB for the
   * deployed functions.
   *
   * Bracket access so Next's bundler does NOT inline this at build time — dot
   * access gets statically replaced with the build-time value, which would
   * freeze the selection. We need the runtime value.
   */
  const storeKind = process.env["AUDIT_STORE"];

  export const auditStore: AuditStore = new LocalAuditStore();
  ```

  Leave `storeKind` in place but unused for now — Task 10 wires it to
  `DynamoAuditStore`. If the linter rejects the unused variable, delete it in this
  task and reintroduce it in Task 10.

- [x] **Step 4: Drop the dependency and remaining references**

  ```bash
  npm uninstall better-sqlite3 @types/better-sqlite3
  ```

  In `render.yaml`, delete the `AUDIT_STORE`/`sqlite` environment entry — on
  Render's free tier there is no persistent disk, so this only ever bought
  restart-scoped durability. In `Dockerfile`, remove any `python3`/`build-essential`
  layer that existed solely to compile `better-sqlite3`.

- [x] **Step 5: Verify nothing references SQLite**

  ```bash
  grep -rn "sqlite" --include='*.ts' --include='*.tsx' --include='*.json' \
    --include='*.yaml' --include='Dockerfile' . | grep -v node_modules
  ```
  Expected: no output.

- [x] **Step 6: Full verification gate**

  ```bash
  ./node_modules/.bin/eslint . && npm run typecheck && npm test && npm run build
  ```
  Expected: all pass.

- [x] **Step 7: Stage (do NOT commit)**

  ```bash
  git add -A src/lib/store package.json package-lock.json render.yaml Dockerfile
  ```

---

# Phase 2 — Framework-free handlers

At the end of this phase the Next routes are thin callers over testable functions
and the app is still deployable to Render.

---

### Task 5: Extract `createAudit` and `getAudit`

**Files:**
- Create: `src/lib/api/audits.ts`
- Create: `src/lib/api/audits.test.ts`
- Modify: `src/app/api/audits/route.ts` (becomes a thin caller)

**Interfaces:**
- Produces:
  - `type ApiResult<T> = { status: number; body: T | { error: string } }`
  - `createAudit(input: { url: unknown; language: unknown }): Promise<ApiResult<AuditRecord>>`
  - `getAudit(id: string | null): Promise<ApiResult<AuditRecord>>`
- Consumes: `enqueueAudit` (async, Task 3), `auditStore`, `validatePublicHttpUrl`,
  `queuedAuditRecord`, `isAuditId`, `auditStrings`, `isLocale` — all pre-existing.

- [x] **Step 1: Write failing test**

  Create `src/lib/api/audits.test.ts`:

  ```ts
  import { beforeEach, describe, expect, it, vi } from "vitest";

  vi.mock("@/lib/store", () => ({
    auditStore: { save: vi.fn().mockResolvedValue(undefined), get: vi.fn() },
  }));
  vi.mock("@/lib/audit/job-queue", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/audit/job-queue")>()),
    enqueueAudit: vi.fn().mockResolvedValue(undefined),
  }));
  vi.mock("@/lib/url-validation", () => ({
    validatePublicHttpUrl: vi.fn(),
  }));

  const { auditStore } = await import("@/lib/store");
  const { enqueueAudit } = await import("@/lib/audit/job-queue");
  const { validatePublicHttpUrl } = await import("@/lib/url-validation");
  const { createAudit, getAudit } = await import("@/lib/api/audits");

  beforeEach(() => {
    vi.mocked(validatePublicHttpUrl).mockResolvedValue("https://example.com/");
    vi.mocked(auditStore.get).mockReset();
    vi.mocked(auditStore.save).mockClear();
    vi.mocked(enqueueAudit).mockClear();
  });

  describe("createAudit", () => {
    it("persists a queued record, dispatches the job, and returns 202", async () => {
      const result = await createAudit({ url: "example.com", language: "vi" });

      expect(result.status).toBe(202);
      expect(auditStore.save).toHaveBeenCalledOnce();
      expect(enqueueAudit).toHaveBeenCalledOnce();
      expect(result.body).toMatchObject({ status: "queued", language: "vi" });
    });

    it("rejects a URL the SSRF guard refuses, without dispatching", async () => {
      vi.mocked(validatePublicHttpUrl).mockRejectedValue(new Error("Private address."));

      const result = await createAudit({ url: "http://169.254.169.254/", language: "en" });

      expect(result.status).toBe(400);
      expect(result.body).toEqual({ error: "Private address." });
      expect(enqueueAudit).not.toHaveBeenCalled();
    });

    it("falls back to English for an unknown language", async () => {
      const result = await createAudit({ url: "example.com", language: "kl" });

      expect(result.body).toMatchObject({ language: "en" });
    });
  });

  describe("getAudit", () => {
    it("returns 400 when the id is missing", async () => {
      expect(await getAudit(null)).toEqual({
        status: 400,
        body: { error: "Audit id is required." },
      });
    });

    it("returns 400 when the id is not an audit id", async () => {
      expect(await getAudit("../etc/passwd")).toEqual({
        status: 400,
        body: { error: "Audit id is invalid." },
      });
    });

    it("returns 404 when the record does not exist", async () => {
      vi.mocked(auditStore.get).mockResolvedValue(null);

      const result = await getAudit("11111111-1111-4111-8111-111111111111");

      expect(result.status).toBe(404);
    });

    it("returns 500 when the store throws", async () => {
      vi.mocked(auditStore.get).mockRejectedValue(new Error("disk gone"));

      const result = await getAudit("11111111-1111-4111-8111-111111111111");

      expect(result).toEqual({
        status: 500,
        body: { error: "The audit record could not be read." },
      });
    });

    it("returns the record on success", async () => {
      const record = { id: "11111111-1111-4111-8111-111111111111", status: "completed" };
      vi.mocked(auditStore.get).mockResolvedValue(record as never);

      expect(await getAudit(record.id)).toEqual({ status: 200, body: record });
    });
  });
  ```

- [x] **Step 2: Run test and verify it fails**

  Run: `npx vitest run src/lib/api/audits.test.ts`
  Expected: FAIL — cannot resolve `@/lib/api/audits`.

- [x] **Step 3: Implement**

  Create `src/lib/api/audits.ts`:

  ```ts
  import { randomUUID } from "node:crypto";
  import type { AuditRecord } from "@/lib/audit-types";
  import { auditStore } from "@/lib/store";
  import { enqueueAudit, queuedAuditRecord, type AuditJob } from "@/lib/audit/job-queue";
  import { isAuditId } from "@/lib/audit/id";
  import { auditStrings } from "@/lib/audit/audit-i18n";
  import { isLocale } from "@/i18n/config";
  import { validatePublicHttpUrl } from "@/lib/url-validation";

  /**
   * Transport-independent result: a status code and a body. Deliberately not a
   * `Response` — these functions are called from a Next route handler, a Lambda
   * Function URL handler and a local dev server, and only one of those three
   * speaks `Response`.
   */
  export type ApiResult<T> = { status: number; body: T | { error: string } };

  function fail(message: string, status: number): ApiResult<never> {
    return { status, body: { error: message } };
  }

  export async function createAudit(input: {
    url: unknown;
    language: unknown;
  }): Promise<ApiResult<AuditRecord>> {
    const url = typeof input.url === "string" ? input.url : "";
    const language = isLocale(input.language) ? input.language : "en";
    const strings = auditStrings(language);

    let normalizedUrl: string;
    try {
      normalizedUrl = await validatePublicHttpUrl(url);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Invalid URL.", 400);
    }

    const job: AuditJob = {
      auditId: randomUUID(),
      url: normalizedUrl,
      language,
      startedAt: new Date().toISOString(),
    };

    // Persist a `queued` record, then dispatch the scan and return immediately.
    // The client polls `getAudit` for progress. This keeps the request fast and
    // decouples the heavy Playwright/AI work from the response.
    const queued = queuedAuditRecord(job, strings);
    await auditStore.save(queued);
    await enqueueAudit(job);

    return { status: 202, body: queued };
  }

  export async function getAudit(id: string | null): Promise<ApiResult<AuditRecord>> {
    if (!id) return fail("Audit id is required.", 400);
    if (!isAuditId(id)) return fail("Audit id is invalid.", 400);

    let record: AuditRecord | null;
    try {
      record = await auditStore.get(id);
    } catch {
      return fail("The audit record could not be read.", 500);
    }

    if (!record) return fail("Audit not found.", 404);

    return { status: 200, body: record };
  }
  ```

- [x] **Step 4: Run test and verify it passes**

  Run: `npx vitest run src/lib/api/audits.test.ts`
  Expected: PASS (8 tests).

- [x] **Step 5: Reduce the Next route to a caller**

  Replace the whole body of `src/app/api/audits/route.ts`:

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { createAudit, getAudit } from "@/lib/api/audits";

  export const runtime = "nodejs";

  export async function POST(request: NextRequest) {
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    const input = (payload ?? {}) as { url?: unknown; language?: unknown };
    const { status, body } = await createAudit({ url: input.url, language: input.language });

    return NextResponse.json(body, { status });
  }

  export async function GET(request: NextRequest) {
    const { status, body } = await getAudit(request.nextUrl.searchParams.get("id"));

    return NextResponse.json(body, { status });
  }
  ```

- [x] **Step 6: Verify behavior is unchanged**

  Run: `npm test && npm run typecheck && npx playwright test`
  Expected: PASS. The e2e spec exercises the real POST/poll flow, so it is the
  actual proof this refactor changed nothing.

- [x] **Step 7: Stage (do NOT commit)**

  ```bash
  git add src/lib/api src/app/api/audits/route.ts
  ```

---

### Task 6: Extract the PDF renderer

**Files:**
- Create: `src/lib/api/pdf.ts`
- Create: `src/lib/api/pdf.test.ts`
- Modify: `src/app/report/[id]/pdf/route.ts` (becomes a thin caller)

**Interfaces:**
- Produces:
  - `type PdfResult = { status: number; pdf?: Uint8Array; error?: string; retryAfterSeconds?: number }`
  - `renderReportPdf(input: { id: string; baseUrl: string }): Promise<PdfResult>`
  - `PDF_MARGIN_PX`, `PDF_WIDTH_PX` constants (exported for the test).
- Consumes: `auditStore`, `isAuditId`, `CHROMIUM_LAUNCH_OPTIONS`.

- [x] **Step 1: Write failing test**

  Create `src/lib/api/pdf.test.ts`:

  ```ts
  // @vitest-environment node
  import { beforeEach, describe, expect, it, vi } from "vitest";

  const page = {
    emulateMedia: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4")),
  };
  const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };

  vi.mock("playwright", () => ({ chromium: { launch: vi.fn(async () => browser) } }));
  vi.mock("@/lib/store", () => ({ auditStore: { get: vi.fn() } }));

  const { auditStore } = await import("@/lib/store");
  const { renderReportPdf, PDF_WIDTH_PX } = await import("@/lib/api/pdf");

  const id = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auditStore.get).mockResolvedValue({ id, status: "completed" } as never);
  });

  describe("renderReportPdf", () => {
    it("rejects an invalid id before launching a browser", async () => {
      const result = await renderReportPdf({ id: "nope", baseUrl: "https://x.test" });

      expect(result.status).toBe(400);
      expect(browser.newPage).not.toHaveBeenCalled();
    });

    it("returns 404 for a report that is not completed", async () => {
      vi.mocked(auditStore.get).mockResolvedValue({ id, status: "running" } as never);

      expect((await renderReportPdf({ id, baseUrl: "https://x.test" })).status).toBe(404);
    });

    it("navigates the print view on the given base URL", async () => {
      await renderReportPdf({ id, baseUrl: "https://d1.cloudfront.net" });

      expect(page.goto).toHaveBeenCalledWith(
        `https://d1.cloudfront.net/report/${id}?print=1`,
        expect.objectContaining({ waitUntil: "networkidle" }),
      );
    });

    it("waits for the client-rendered report to signal readiness", async () => {
      await renderReportPdf({ id, baseUrl: "https://x.test" });

      expect(page.waitForSelector).toHaveBeenCalledWith(
        "[data-report-ready='true']",
        expect.any(Object),
      );
    });

    it("lays the page out at the printable A4 width", async () => {
      await renderReportPdf({ id, baseUrl: "https://x.test" });

      expect(browser.newPage).toHaveBeenCalledWith({
        viewport: { width: PDF_WIDTH_PX, height: 1123 },
      });
    });

    it("returns the rendered bytes and always closes the browser", async () => {
      const result = await renderReportPdf({ id, baseUrl: "https://x.test" });

      expect(result.status).toBe(200);
      expect(result.pdf).toBeInstanceOf(Uint8Array);
      expect(browser.close).toHaveBeenCalledOnce();
    });

    it("returns 500 and still closes the browser when rendering throws", async () => {
      page.pdf.mockRejectedValueOnce(new Error("boom"));

      const result = await renderReportPdf({ id, baseUrl: "https://x.test" });

      expect(result.status).toBe(500);
      expect(browser.close).toHaveBeenCalledOnce();
    });
  });
  ```

- [x] **Step 2: Run test and verify it fails**

  Run: `npx vitest run src/lib/api/pdf.test.ts`
  Expected: FAIL — cannot resolve `@/lib/api/pdf`.

- [x] **Step 3: Implement**

  Create `src/lib/api/pdf.ts`, moving the logic from the route. Two changes from
  the original: the target URL is passed in rather than assembled from
  `127.0.0.1:$PORT`, and readiness is an explicit selector rather than
  `networkidle` alone (the report page is client-rendered now).

  ```ts
  import { chromium } from "playwright";
  import { auditStore } from "@/lib/store";
  import { isAuditId } from "@/lib/audit/id";
  import { CHROMIUM_LAUNCH_OPTIONS } from "@/lib/chromium";

  /**
   * A4 at 96dpi in CSS pixels, and the margin used below. Chromium lays the
   * printed document out in `paper width − horizontal margins`, so the window has
   * to be exactly that wide: text that measures itself (the fitted URL headline)
   * is sized while the page is on screen, and from a 1280px window it comes out
   * too big for the paper and gets clipped.
   */
  export const PDF_MARGIN_PX = 16;
  export const PDF_WIDTH_PX = 794 - PDF_MARGIN_PX * 2;

  export type PdfResult = {
    status: number;
    pdf?: Uint8Array;
    error?: string;
  };

  /**
   * Render the shared report to a PDF with the same Chromium the scanner uses.
   *
   * `baseUrl` is injected rather than derived: in production this is the
   * CloudFront domain (reachable from Lambda), and in local development it is the
   * local server. Screen media is kept so the design carries into the PDF.
   */
  export async function renderReportPdf(input: {
    id: string;
    baseUrl: string;
  }): Promise<PdfResult> {
    const { id, baseUrl } = input;

    if (!isAuditId(id)) return { status: 400, error: "Invalid report id." };

    const record = await auditStore.get(id);
    if (!record || record.status !== "completed") {
      return { status: 404, error: "Report not found." };
    }

    const target = `${baseUrl.replace(/\/$/, "")}/report/${id}?print=1`;

    let browser;
    try {
      browser = await chromium.launch(CHROMIUM_LAUNCH_OPTIONS);
      const page = await browser.newPage({
        viewport: { width: PDF_WIDTH_PX, height: 1123 },
      });
      await page.emulateMedia({ media: "screen" });
      await page.goto(target, { waitUntil: "networkidle", timeout: 45_000 });

      // The report fetches its own record, so "network is idle" can mean "the
      // skeleton finished rendering". Wait for the page to say it is ready.
      await page.waitForSelector("[data-report-ready='true']", { timeout: 30_000 });

      // Self-measuring text re-fits once the display font lands, a frame later.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            void document.fonts.ready.then(() =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            );
          }),
      );

      const margin = `${PDF_MARGIN_PX}px`;
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: margin, bottom: margin, left: margin, right: margin },
      });

      return { status: 200, pdf: new Uint8Array(pdf) };
    } catch (error) {
      console.error("[pdf] generation failed:", error);
      return { status: 500, error: "Could not generate the PDF report." };
    } finally {
      await browser?.close();
    }
  }
  ```

- [x] **Step 4: Run test and verify it passes**

  Run: `npx vitest run src/lib/api/pdf.test.ts`
  Expected: PASS (7 tests).

- [x] **Step 5: Reduce the Next route to a caller**

  Replace the body of `src/app/report/[id]/pdf/route.ts`. The in-process
  concurrency counter stays here for now — it is Render's protection and is
  removed with the route in Task 11.

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { renderReportPdf } from "@/lib/api/pdf";

  export const runtime = "nodejs";
  export const dynamic = "force-dynamic";

  const MAX_CONCURRENT_PDF = Number(process.env.SITEDOC_MAX_CONCURRENT_PDF) || 1;
  let pdfsInFlight = 0;

  export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const { id } = await params;

    if (pdfsInFlight >= MAX_CONCURRENT_PDF) {
      return NextResponse.json(
        { error: "The PDF service is busy. Please retry shortly." },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }

    pdfsInFlight += 1;
    try {
      const baseUrl = `http://127.0.0.1:${process.env.PORT || "3000"}`;
      const result = await renderReportPdf({ id, baseUrl });

      if (!result.pdf) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return new NextResponse(result.pdf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="sitedoc-${id}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      pdfsInFlight -= 1;
    }
  }
  ```

- [x] **Step 6: Verify a real PDF still downloads**

  With `npm run dev` running and a completed audit id from Task 3 Step 7:
  ```bash
  curl -s -o /tmp/report.pdf -w '%{http_code} %{content_type}\n' \
    "localhost:3000/report/<id>/pdf"
  file /tmp/report.pdf
  ```
  Expected: `200 application/pdf` and `PDF document`.

  **Note:** this will currently succeed *without* the `data-report-ready`
  attribute existing, because `waitForSelector` is only reached after
  `networkidle` and the server-rendered page has no such marker — so this step
  will actually FAIL with a selector timeout. That is expected and correct: the
  attribute is added in Task 10. If you need PDF working between now and then,
  run Task 10 before Task 6's Step 6 verification.

- [x] **Step 7: Stage (do NOT commit)**

  ```bash
  git add src/lib/api/pdf.ts src/lib/api/pdf.test.ts "src/app/report/[id]/pdf/route.ts"
  ```

---

# Phase 3 — Static export and local dev host

This is the phase that breaks Render compatibility. It lands as one coherent
sequence; do not stop halfway.

---

### Task 7: Local server (API + optional static hosting)

One script serves both development modes: API-only on port 4000 alongside
`next dev`, or API + static `out/` on port 3000 as a local stand-in for
CloudFront (used by the e2e suite).

**Files:**
- Create: `scripts/local-server.ts`
- Create: `scripts/local-server.test.ts`
- Modify: `package.json` (scripts + `tsx`, `concurrently` devDependencies)
- Create: `.env.development`

**Interfaces:**
- Produces:
  - `createLocalServer(options: { staticDir?: string }): http.Server` from
    `scripts/local-server.ts`.
  - npm scripts: `dev` (next dev + api), `dev:api`, `serve:local`.
  - `NEXT_PUBLIC_API_BASE` — `http://localhost:4000` in development, empty in
    production.
- Consumes: `createAudit`, `getAudit` (Task 5), `renderReportPdf` (Task 6),
  `artifactStore` (Task 1).

- [x] **Step 1: Add the dependencies**

  ```bash
  npm install --save-dev tsx concurrently
  ```

- [x] **Step 2: Write failing test**

  Create `scripts/local-server.test.ts`:

  ```ts
  // @vitest-environment node
  import type { AddressInfo } from "node:net";
  import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

  vi.mock("@/lib/api/audits", () => ({
    createAudit: vi.fn(async () => ({ status: 202, body: { id: "queued-id" } })),
    getAudit: vi.fn(async (id: string | null) =>
      id === "known" ? { status: 200, body: { id: "known" } } : { status: 404, body: { error: "Audit not found." } },
    ),
  }));
  vi.mock("@/lib/api/pdf", () => ({
    renderReportPdf: vi.fn(async () => ({ status: 200, pdf: new Uint8Array([1, 2]) })),
  }));

  const { createLocalServer } = await import("../scripts/local-server");

  let base: string;
  const server = createLocalServer({});

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  describe("local server", () => {
    it("routes POST /api/audits to createAudit", async () => {
      const res = await fetch(`${base}/api/audits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com", language: "en" }),
      });

      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ id: "queued-id" });
    });

    it("rejects a malformed JSON body with 400", async () => {
      const res = await fetch(`${base}/api/audits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      });

      expect(res.status).toBe(400);
    });

    it("routes GET /api/audits?id= to getAudit", async () => {
      expect((await fetch(`${base}/api/audits?id=known`)).status).toBe(200);
      expect((await fetch(`${base}/api/audits?id=missing`)).status).toBe(404);
    });

    it("serves a PDF at /pdf/:id", async () => {
      const res = await fetch(`${base}/pdf/11111111-1111-4111-8111-111111111111`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
    });

    it("404s an unknown path", async () => {
      expect((await fetch(`${base}/nope`)).status).toBe(404);
    });
  });
  ```

- [x] **Step 3: Run test and verify it fails**

  Run: `npx vitest run scripts/local-server.test.ts`
  Expected: FAIL — the test file is outside vitest's `include` glob, so it is not
  even collected ("No test files found").

- [x] **Step 4: Widen the vitest include glob**

  In `vitest.config.ts`, change `include` to:

  ```ts
  include: [
    "src/**/*.{test,spec}.{ts,tsx}",
    "scripts/**/*.{test,spec}.ts",
    "lambda/**/*.{test,spec}.ts",
  ],
  ```

  Re-run Step 3's command. Expected now: FAIL — cannot resolve
  `../scripts/local-server`.

- [x] **Step 5: Implement the server**

  Create `scripts/local-server.ts`:

  ```ts
  /**
   * Local stand-in for the deployed edge. Two modes:
   *
   *   PORT=4000 tsx scripts/local-server.ts              → API only, for `next dev`
   *   tsx scripts/local-server.ts --static out --port 3000 → API + static export
   *
   * The second mode is what the e2e suite drives: it approximates CloudFront's
   * routing table (static shell, /api/*, /pdf/*, /artifacts/*) closely enough to
   * catch routing mistakes before they reach AWS.
   */
  import { createReadStream } from "node:fs";
  import { stat } from "node:fs/promises";
  import http from "node:http";
  import path from "node:path";
  import { createAudit, getAudit } from "@/lib/api/audits";
  import { renderReportPdf } from "@/lib/api/pdf";
  import { artifactStore } from "@/lib/store";

  const CONTENT_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
  };

  function sendJson(res: http.ServerResponse, status: number, body: unknown) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  async function readBody(req: http.IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  }

  async function sendFile(res: http.ServerResponse, file: string, cacheControl: string) {
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error("not a file");

      res.writeHead(200, {
        "content-type": CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
        "content-length": info.size,
        "cache-control": cacheControl,
      });
      createReadStream(file).pipe(res);
    } catch {
      sendJson(res, 404, { error: "Not found." });
    }
  }

  export function createLocalServer(options: { staticDir?: string }): http.Server {
    return http.createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const { pathname } = url;

      try {
        if (pathname === "/api/audits" && req.method === "POST") {
          let payload: unknown;
          try {
            payload = JSON.parse(await readBody(req));
          } catch {
            return sendJson(res, 400, { error: "Request body must be valid JSON." });
          }
          const input = (payload ?? {}) as { url?: unknown; language?: unknown };
          const result = await createAudit({ url: input.url, language: input.language });
          return sendJson(res, result.status, result.body);
        }

        if (pathname === "/api/audits" && req.method === "GET") {
          const result = await getAudit(url.searchParams.get("id"));
          return sendJson(res, result.status, result.body);
        }

        if (pathname.startsWith("/pdf/") && req.method === "GET") {
          const id = pathname.slice("/pdf/".length);
          const baseUrl = `http://127.0.0.1:${(req.socket.localPort ?? 3000).toString()}`;
          const result = await renderReportPdf({ id, baseUrl });

          if (!result.pdf) return sendJson(res, result.status, { error: result.error });

          res.writeHead(200, {
            "content-type": "application/pdf",
            "content-disposition": `attachment; filename="sitedoc-${id}.pdf"`,
            "cache-control": "no-store",
            "content-length": result.pdf.byteLength,
          });
          return res.end(result.pdf);
        }

        // Screenshots. Mirrors the CloudFront `/artifacts/*` behavior.
        if (pathname.startsWith("/artifacts/")) {
          const [, , id, file] = pathname.split("/");
          if (!id || !file || file.includes("..")) {
            return sendJson(res, 400, { error: "Invalid artifact path." });
          }
          const dir = artifactStore.stagingDirectory(id);
          return sendFile(res, path.join(dir, file), "public, max-age=31536000, immutable");
        }

        if (options.staticDir) {
          const root = path.resolve(options.staticDir);
          // `/report/<id>` → the exported shell, mirroring the CloudFront Function.
          const rel = pathname.startsWith("/report/")
            ? "report/index.html"
            : pathname === "/"
              ? "index.html"
              : pathname.slice(1);
          const candidate = path.join(root, rel);
          const file = path.extname(candidate) ? candidate : path.join(candidate, "index.html");

          if (!file.startsWith(root)) return sendJson(res, 400, { error: "Invalid path." });

          return sendFile(res, file, "public, max-age=0, must-revalidate");
        }

        return sendJson(res, 404, { error: "Not found." });
      } catch (error) {
        console.error("[local-server]", error);
        return sendJson(res, 500, { error: "Internal error." });
      }
    });
  }

  // Only start listening when run directly, so the test can import and control it.
  if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
    const args = process.argv.slice(2);
    const staticIndex = args.indexOf("--static");
    const portIndex = args.indexOf("--port");
    const port = Number(
      portIndex >= 0 ? args[portIndex + 1] : (process.env.PORT ?? 4000),
    );
    const staticDir = staticIndex >= 0 ? (args[staticIndex + 1] ?? "out") : undefined;

    createLocalServer({ staticDir }).listen(port, () => {
      console.log(
        `[local-server] http://localhost:${port}${staticDir ? ` (static: ${staticDir})` : " (api only)"}`,
      );
    });
  }
  ```

- [x] **Step 6: Run test and verify it passes**

  Run: `npx vitest run scripts/local-server.test.ts`
  Expected: PASS (5 tests).

  If module resolution of `@/lib/...` fails inside `scripts/`, add
  `"paths": { "@/*": ["./src/*"] }` coverage for the `scripts` directory by
  ensuring `tsconfig.json`'s `include` lists `scripts/**/*.ts`.

- [x] **Step 7: Wire the npm scripts and dev env**

  In `package.json`, replace the `dev` script and add two more:

  ```json
  "dev": "concurrently -n next,api -c cyan,magenta \"next dev\" \"npm run dev:api\"",
  "dev:api": "PORT=4000 tsx watch scripts/local-server.ts",
  "serve:local": "tsx scripts/local-server.ts --static out --port 3000"
  ```

  Create `.env.development` (committed; contains no secrets):

  ```
  # In development the API is a separate process on :4000. In production the
  # static export and the API share one origin behind CloudFront, so this is
  # empty and `fetch` uses relative URLs.
  NEXT_PUBLIC_API_BASE=http://localhost:4000
  ```

- [x] **Step 8: Stage (do NOT commit)**

  ```bash
  git add scripts package.json package-lock.json vitest.config.ts \
    tsconfig.json .env.development
  ```

---

### Task 8: Point the client at `NEXT_PUBLIC_API_BASE` and extend the poll window

**Files:**
- Modify: `src/app/page.tsx:93,98,117-120`
- Create: `src/lib/api-base.ts`
- Create: `src/lib/api-base.test.ts`

**Interfaces:**
- Produces: `apiUrl(path: string): string` from `@/lib/api-base`.
- Consumes: `NEXT_PUBLIC_API_BASE` (Task 7).

- [x] **Step 1: Write failing test**

  Create `src/lib/api-base.test.ts`:

  ```ts
  import { afterEach, describe, expect, it, vi } from "vitest";

  async function load() {
    vi.resetModules();
    return (await import("@/lib/api-base")).apiUrl;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("apiUrl", () => {
    it("returns a same-origin path when no base is configured", async () => {
      vi.stubEnv("NEXT_PUBLIC_API_BASE", "");
      expect((await load())("/api/audits")).toBe("/api/audits");
    });

    it("prefixes the configured base in development", async () => {
      vi.stubEnv("NEXT_PUBLIC_API_BASE", "http://localhost:4000");
      expect((await load())("/api/audits")).toBe("http://localhost:4000/api/audits");
    });

    it("does not double the slash when the base has a trailing one", async () => {
      vi.stubEnv("NEXT_PUBLIC_API_BASE", "http://localhost:4000/");
      expect((await load())("/api/audits")).toBe("http://localhost:4000/api/audits");
    });
  });
  ```

- [x] **Step 2: Run test and verify it fails**

  Run: `npx vitest run src/lib/api-base.test.ts`
  Expected: FAIL — cannot resolve `@/lib/api-base`.

- [x] **Step 3: Implement**

  Create `src/lib/api-base.ts`:

  ```ts
  /**
   * Where the API lives, from the browser's point of view.
   *
   * Empty in production: the static export and the Lambda-backed API share one
   * CloudFront origin, so relative URLs work and there is no CORS anywhere. In
   * development the API is a separate process, so requests need an absolute base.
   *
   * Dot access is intentional here — `NEXT_PUBLIC_*` is inlined at build time by
   * design, which is exactly what a client bundle needs.
   */
  const base = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");

  export function apiUrl(path: string): string {
    return `${base}${path}`;
  }
  ```

- [x] **Step 4: Run test and verify it passes**

  Run: `npx vitest run src/lib/api-base.test.ts`
  Expected: PASS (3 tests).

- [x] **Step 5: Use it in the client and widen the poll window**

  In `src/app/page.tsx`, add `import { apiUrl } from "@/lib/api-base";`, then:

  - line 93 — raise the timeout, with the reason recorded:
    ```ts
    /**
     * 180s rather than 120s: a cold scan worker pulls its container image before
     * it starts, and giving up on a scan that is still running is worse than
     * waiting.
     */
    async function pollAudit(id: string, timeoutMs = 180_000): Promise<AuditRecord> {
    ```
  - line 98 — `const res = await fetch(apiUrl(`/api/audits?id=${encodeURIComponent(id)}`));`
  - line 120 — `const response = await fetch(apiUrl("/api/audits"), {`

- [x] **Step 6: Verify**

  Run: `npm test && npm run typecheck`
  Expected: PASS.

  Then with `npm run dev` running (both processes), open http://localhost:3000,
  submit `https://example.com`, and confirm the audit completes. Check the
  browser network tab shows requests to `localhost:4000`.

- [x] **Step 7: Stage (do NOT commit)**

  ```bash
  git add src/lib/api-base.ts src/lib/api-base.test.ts src/app/page.tsx
  ```

---

### Task 9: Split the report page into a static shell and a client component

**Files:**
- Create: `src/app/report/page.tsx` (server component, static metadata)
- Create: `src/components/report/ReportClient.tsx`
- Create: `src/components/report/ReportClient.test.tsx`
- Delete: `src/app/report/[id]/page.tsx`
- Create: `public/og-report.png`

**Interfaces:**
- Produces:
  - `ReportClient` — no props; derives the id from `usePathname()`.
  - `data-report-ready="true"` on the rendered report root, consumed by
    `renderReportPdf` (Task 6).
- Consumes: `apiUrl` (Task 8), `ReportView`, `NotFoundPanel`, `dictionaries`,
  `isLocale`, `DEFAULT_LOCALE`, `FitText`, `Sticker`, `WaveEdge`.

- [x] **Step 1: Write failing test**

  Create `src/components/report/ReportClient.test.tsx`:

  ```tsx
  import { render, screen, waitFor } from "@testing-library/react";
  import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

  const pathname = vi.fn(() => "/report/11111111-1111-4111-8111-111111111111");
  vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

  const { ReportClient } = await import("@/components/report/ReportClient");

  const record = {
    id: "11111111-1111-4111-8111-111111111111",
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    status: "completed",
    language: "vi",
    createdAt: "2026-08-05T00:00:00.000Z",
    completedAt: "2026-08-05T00:00:30.000Z",
    screenshots: { desktop: "/artifacts/x/desktop.png", mobile: "/artifacts/x/mobile.png" },
    consoleErrors: [],
    failedRequests: [],
    issues: [],
    metrics: [],
    scores: { overall: 90 },
    summary: "ok",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(record), {
      status: 200, headers: { "content-type": "application/json" },
    })));
  });
  afterEach(() => vi.unstubAllGlobals());

  describe("ReportClient", () => {
    it("marks itself ready only once the record has loaded", async () => {
      const { container } = render(<ReportClient />);

      expect(container.querySelector("[data-report-ready='true']")).toBeNull();

      await waitFor(() =>
        expect(container.querySelector("[data-report-ready='true']")).not.toBeNull(),
      );
    });

    it("renders the audited URL from the fetched record", async () => {
      render(<ReportClient />);

      await waitFor(() => expect(screen.getByTitle("https://example.com/")).toBeTruthy());
    });

    it("renders the 404 panel when the record is missing", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));

      render(<ReportClient />);

      await waitFor(() =>
        expect(document.querySelector("[data-report-missing='true']")).not.toBeNull(),
      );
    });

    it("renders the 404 panel for a malformed id without fetching", async () => {
      pathname.mockReturnValueOnce("/report/not-an-id");

      render(<ReportClient />);

      await waitFor(() =>
        expect(document.querySelector("[data-report-missing='true']")).not.toBeNull(),
      );
      expect(fetch).not.toHaveBeenCalled();
    });
  });
  ```

- [x] **Step 2: Run test and verify it fails**

  Run: `npx vitest run src/components/report/ReportClient.test.tsx`
  Expected: FAIL — cannot resolve `@/components/report/ReportClient`.

- [x] **Step 3: Implement `ReportClient`**

  Create `src/components/report/ReportClient.tsx`. This is the existing
  `report/[id]/page.tsx` body with the data access turned around: the record
  arrives from `fetch` instead of `auditStore`, and the not-found case renders a
  panel instead of calling `notFound()`.

  ```tsx
  "use client";

  import { useEffect, useState } from "react";
  import Link from "next/link";
  import { usePathname, useSearchParams } from "next/navigation";
  import type { AuditRecord } from "@/lib/audit-types";
  import { apiUrl } from "@/lib/api-base";
  import { isAuditId } from "@/lib/audit/id";
  import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
  import { dictionaries } from "@/i18n/dictionaries";
  import { ReportView } from "@/components/report/ReportView";
  import { NotFoundPanel } from "@/components/ui/NotFoundPanel";
  import { FitText } from "@/components/ui/FitText";
  import { Sticker, WaveEdge } from "@/components/ui/decor";

  type LoadState =
    | { kind: "loading" }
    | { kind: "missing" }
    | { kind: "loaded"; record: AuditRecord };

  export function ReportClient() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const printMode = searchParams.get("print") === "1";
    const id = pathname.split("/").filter(Boolean).at(-1) ?? "";
    const [state, setState] = useState<LoadState>({ kind: "loading" });

    useEffect(() => {
      if (!isAuditId(id)) {
        setState({ kind: "missing" });
        return;
      }

      let active = true;

      void (async () => {
        try {
          const res = await fetch(apiUrl(`/api/audits?id=${encodeURIComponent(id)}`));
          if (!active) return;

          if (!res.ok) return setState({ kind: "missing" });

          const record = (await res.json()) as AuditRecord;
          if (!active) return;

          setState(
            record.status === "completed" ? { kind: "loaded", record } : { kind: "missing" },
          );
        } catch {
          if (active) setState({ kind: "missing" });
        }
      })();

      return () => {
        active = false;
      };
    }, [id]);

    if (state.kind === "missing") {
      return (
        <div data-report-missing="true">
          <NotFoundPanel variant="report" />
        </div>
      );
    }

    if (state.kind === "loading") {
      // Deliberately unstyled-but-sized: the PDF renderer keys off
      // `data-report-ready`, so this must never claim readiness.
      return <main className="mx-auto min-h-[60vh] w-full max-w-5xl px-4 py-20" aria-busy="true" />;
    }

    const { record } = state;
    // A shared report renders in the language it was created in, not the viewer's.
    const locale = isLocale(record.language) ? record.language : DEFAULT_LOCALE;
    const t = dictionaries[locale];
    const generatedOn = record.completedAt
      ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(
          new Date(record.completedAt),
        )
      : null;

    return (
      <main
        className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6"
        data-report-ready="true"
      >
        <header className="py-7">
          <div className="pop-lg overflow-hidden rounded-[2rem]">
            <div className="sunburst relative px-5 pt-8 pb-12 text-center sm:px-9">
              <Sticker className="mb-5 bg-paper-2 px-5 py-2" tilt={-2}>
                <span className="eyebrow text-xs text-ink">
                  {t.brand} · {t.report.sharedNote}
                </span>
              </Sticker>
              {/* The audited URL, always on one line: it shrinks to fit instead of
                  breaking mid-token across two or three lines. */}
              <FitText
                as="h1"
                className="mx-auto max-w-4xl"
                maxFontSize="clamp(1.5rem, 4.6vw, 2.9rem)"
                minFontSize="0.85rem"
                style={{ ["--stroke-w" as string]: "0.045em" }}
                textClassName="headline headline-pop"
                title={record.finalUrl ?? record.url}
              >
                {record.finalUrl ?? record.url}
              </FitText>
              <WaveEdge className="absolute inset-x-0 bottom-0" fill="var(--paper-2)" />
            </div>

            <div className="flex flex-col items-center justify-between gap-3 bg-paper-2 px-5 pb-6 sm:flex-row sm:px-9">
              {generatedOn ? (
                <p className="eyebrow text-[0.7rem] text-ink-soft">
                  {t.report.generatedOn} {generatedOn}
                </p>
              ) : (
                <span />
              )}

              {!printMode ? (
                <div className="no-print flex flex-wrap justify-center gap-2.5">
                  <a
                    className="btn-pop inline-flex items-center rounded-full bg-lemon px-4 py-2 font-display text-sm uppercase tracking-wide text-on-bright"
                    href={`/pdf/${record.id}`}
                  >
                    {t.report.downloadPdf}
                  </a>
                  <Link
                    className="btn-pop inline-flex items-center rounded-full bg-panel px-4 py-2 font-display text-sm uppercase tracking-wide text-ink"
                    href="/"
                  >
                    {t.report.backToApp}
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <ReportView report={record} t={t} printMode={printMode} />
      </main>
    );
  }
  ```

- [x] **Step 4: Run test and verify it passes**

  Run: `npx vitest run src/components/report/ReportClient.test.tsx`
  Expected: PASS (4 tests).

- [x] **Step 5: Create the static server-component shell**

  Create `src/app/report/page.tsx`. It stays a **server** component on purpose:
  a client component cannot `export const metadata`, and this is what carries the
  Open Graph tags for shared links. Server components are fine under
  `output: "export"` — they render at build time.

  ```tsx
  import { Suspense } from "react";
  import type { Metadata } from "next";
  import { ReportClient } from "@/components/report/ReportClient";

  /**
   * Shared report links get a generic card, not a per-report one: the page is
   * statically exported and the record is fetched in the browser, so there is no
   * build-time knowledge of any individual audit.
   */
  export const metadata: Metadata = {
    title: "SiteDoc AI — Website audit report",
    description: "Accessibility, SEO, performance and UX findings for an audited page.",
    openGraph: {
      title: "SiteDoc AI — Website audit report",
      description: "Accessibility, SEO, performance and UX findings for an audited page.",
      images: ["/og-report.png"],
    },
  };

  export default function ReportPage() {
    // `useSearchParams` in the client child requires a Suspense boundary.
    return (
      <Suspense fallback={<main className="min-h-[60vh]" aria-busy="true" />}>
        <ReportClient />
      </Suspense>
    );
  }
  ```

- [x] **Step 6: Delete the dynamic route and add the OG image**

  ```bash
  git rm "src/app/report/[id]/page.tsx"
  ```

  Create `public/og-report.png` — a 1200×630 card. Generate it from the existing
  design tokens rather than inventing new art:

  ```bash
  node -e '
  const { chromium } = require("playwright");
  (async () => {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
    await p.setContent(`<div style="width:1200px;height:630px;display:flex;
      align-items:center;justify-content:center;background:#FFF6E5;
      font-family:sans-serif;font-weight:800;font-size:84px;color:#1A1A1A;
      border:16px solid #1A1A1A;box-sizing:border-box">SiteDoc AI</div>`);
    await p.screenshot({ path: "public/og-report.png" });
    await b.close();
  })();'
  ```

  Confirm: `file public/og-report.png` reports `1200 x 630`.

- [x] **Step 7: Verify**

  Run: `npm test && npm run typecheck && npm run build`
  Expected: PASS. `npm run build` must not complain about a missing
  `generateStaticParams` — the dynamic segment is gone.

  Then with `npm run dev` running, open
  `http://localhost:3000/report/<completed-id>` and confirm the report renders,
  the URL headline fits on one line, and the PDF button points at `/pdf/<id>`.

- [x] **Step 8: Stage (do NOT commit)**

  ```bash
  git add -A src/app/report src/components/report public/og-report.png
  ```

---

### Task 10: Flip to `output: "export"` and delete the Next routes

**Files:**
- Modify: `next.config.ts`
- Delete: `src/app/api/audits/route.ts`, `src/app/api/artifacts/[id]/[file]/route.ts`,
  `src/app/report/[id]/pdf/route.ts`
- Modify: `src/lib/store/local-artifact-store.ts` (URL flip)
- Modify: `src/lib/store/local-artifact-store.test.ts`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json` (drop `start`, add `export` verification)

**Interfaces:**
- Produces: `out/` static export; `LocalArtifactStore.urlFor` now returns
  `/artifacts/<id>/<file>`.
- Consumes: `scripts/local-server.ts` (Task 7) — it must already serve
  `/artifacts/*` and `/pdf/*`, or screenshots and PDFs break here.

- [x] **Step 1: Flip the artifact URL and its test**

  In `src/lib/store/local-artifact-store.ts`:

  ```ts
    urlFor(auditId: string, file: string): string {
      return `/artifacts/${auditId}/${file}`;
    }
  ```

  In `src/lib/store/local-artifact-store.test.ts`, update the third test:

  ```ts
    it("serves artifacts on the same path shape CloudFront uses", () => {
      const store = new LocalArtifactStore("/tmp/whatever");

      expect(store.urlFor("abc", "desktop.png")).toBe("/artifacts/abc/desktop.png");
    });
  ```

  Run: `npx vitest run src/lib/store/local-artifact-store.test.ts`
  Expected: PASS.

- [x] **Step 2: Enable static export**

  Replace `next.config.ts`:

  ```ts
  import type { NextConfig } from "next";

  const nextConfig: NextConfig = {
    /**
     * Static export. The app is served from S3 behind CloudFront with no compute
     * in the page path, which is the entire point of the AWS migration: no cold
     * start on first paint. The API, PDF renderer and scan worker are Lambdas.
     *
     * Consequences, all deliberate: no route handlers, no dynamic segments
     * without `generateStaticParams`, no server-side data fetching.
     */
    output: "export",
    images: { unoptimized: true },
  };

  export default nextConfig;
  ```

- [x] **Step 3: Delete the route handlers**

  ```bash
  git rm src/app/api/audits/route.ts
  git rm "src/app/api/artifacts/[id]/[file]/route.ts"
  git rm "src/app/report/[id]/pdf/route.ts"
  find src/app/api src/app/report -type d -empty -delete
  ```

- [x] **Step 4: Verify the export builds**

  Run: `npm run build`
  Expected: PASS, and `out/` now exists containing `index.html`,
  `report/index.html` and `404.html`.

  ```bash
  ls out/index.html out/report/index.html out/404.html
  ```

  If the build fails on a route handler, one was missed in Step 3. If it fails on
  `dynamic = "force-dynamic"`, a stale export remains in a page file.

- [x] **Step 5: Update the e2e runner**

  In `package.json`, remove the `start` script (`next start` is unsupported under
  `output: "export"`). In `playwright.config.ts` replace the `webServer` block:

  ```ts
    /**
     * Serves the static export plus the API from one origin, approximating the
     * CloudFront routing table so routing mistakes surface locally.
     */
    webServer: {
      command: "npm run serve:local",
      url: "http://localhost:3000",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ```

- [x] **Step 6: Run the e2e suite against the export**

  ```bash
  npm run build && npx playwright test
  ```
  Expected: PASS. This is the real proof of Phase 3: a full audit submitted from
  a statically exported page, served by the local stand-in for CloudFront.

- [x] **Step 7: Verify a PDF renders from the static report**

  With `npm run serve:local` running and a completed audit:
  ```bash
  curl -s -o /tmp/report.pdf -w '%{http_code} %{content_type}\n' \
    "localhost:3000/pdf/<id>"
  file /tmp/report.pdf
  ```
  Expected: `200 application/pdf`. This exercises the `data-report-ready` wait
  added in Tasks 6 and 9 — if it times out, the attribute is not being set.

- [x] **Step 8: Update CI**

  In `.github/workflows/ci.yml`, ensure the e2e job runs `npm run build` before
  `npx playwright test` (the `webServer` command no longer builds anything), and
  that no step references `npm run start`.

- [x] **Step 9: Full verification gate**

  ```bash
  ./node_modules/.bin/eslint . && npm run typecheck && npm test && npm run build
  ```
  Expected: all pass.

- [x] **Step 10: Stage (do NOT commit)**

  ```bash
  git add -A next.config.ts src/app src/lib/store package.json \
    playwright.config.ts .github/workflows/ci.yml
  ```

---

# Phase 4 — AWS adapters and Lambda handlers

Everything here is verified locally with mocked SDK clients and the Lambda
Runtime Interface Emulator. No AWS account is touched.

---

### Task 11: `DynamoAuditStore`

**Files:**
- Create: `src/lib/store/dynamo-store.ts`
- Create: `src/lib/store/dynamo-store.test.ts`
- Modify: `src/lib/store/index.ts`
- Modify: `src/lib/audit-types.ts` (add `truncated?: true`)
- Modify: `package.json` (`@aws-sdk/client-dynamodb`)

**Interfaces:**
- Produces:
  - `class DynamoAuditStore implements AuditStore` — constructor
    `({ tableName, client?, ttlDays? })`.
  - `encodeRecord(record: AuditRecord): { bytes: Uint8Array; truncated: boolean }`
    and `decodeRecord(bytes: Uint8Array): AuditRecord` (exported for tests).
  - `AUDIT_STORE=dynamo` + `SITEDOC_TABLE` environment contract.
- Consumes: `AuditStore` (`@/lib/store/types`), `AuditRecord`.

- [x] **Step 1: Add the dependency**

  ```bash
  npm install @aws-sdk/client-dynamodb
  ```

- [x] **Step 2: Write failing test**

  Create `src/lib/store/dynamo-store.test.ts`:

  ```ts
  // @vitest-environment node
  import { gunzipSync } from "node:zlib";
  import { describe, expect, it, vi } from "vitest";
  import type { AuditRecord } from "@/lib/audit-types";
  import {
    DynamoAuditStore,
    decodeRecord,
    encodeRecord,
  } from "@/lib/store/dynamo-store";

  const base: AuditRecord = {
    id: "11111111-1111-4111-8111-111111111111",
    url: "https://example.com/",
    status: "completed",
    language: "en",
    createdAt: "2026-08-05T00:00:00.000Z",
    screenshots: { desktop: "/artifacts/x/desktop.png", mobile: "/artifacts/x/mobile.png" },
    consoleErrors: [],
    failedRequests: [],
    issues: [],
    metrics: [],
    scores: { overall: 90 },
    summary: "ok",
  };

  function client(send: ReturnType<typeof vi.fn>) {
    return { send } as unknown as ConstructorParameters<typeof DynamoAuditStore>[0]["client"];
  }

  describe("record encoding", () => {
    it("round-trips a record through gzip", () => {
      const { bytes, truncated } = encodeRecord(base);

      expect(truncated).toBe(false);
      expect(JSON.parse(gunzipSync(bytes).toString("utf8"))).toEqual(base);
      expect(decodeRecord(bytes)).toEqual(base);
    });

    it("compresses, so the stored bytes are smaller than the JSON", () => {
      const noisy: AuditRecord = {
        ...base,
        consoleErrors: Array.from({ length: 500 }, (_, i) => ({
          text: `Uncaught TypeError: cannot read property of undefined (${i})`,
          url: "https://example.com/app.js",
          lineNumber: i,
        })) as AuditRecord["consoleErrors"],
      };

      const { bytes } = encodeRecord(noisy);

      expect(bytes.byteLength).toBeLessThan(JSON.stringify(noisy).length / 2);
    });

    it("sheds console noise first when the compressed record is too large", () => {
      const huge: AuditRecord = {
        ...base,
        consoleErrors: Array.from({ length: 200_000 }, (_, i) => ({
          text: `error ${i} ${Math.random().toString(36)}`,
          url: `https://example.com/${i}`,
          lineNumber: i,
        })) as AuditRecord["consoleErrors"],
      };

      const { bytes, truncated } = encodeRecord(huge);
      const decoded = decodeRecord(bytes);

      expect(truncated).toBe(true);
      expect(bytes.byteLength).toBeLessThanOrEqual(350_000);
      expect(decoded.consoleErrors.length).toBeLessThan(200_000);
      expect(decoded.truncated).toBe(true);
      // Scores and summary are never shed — they are the point of the report.
      expect(decoded.scores).toEqual(base.scores);
      expect(decoded.summary).toBe("ok");
    });
  });

  describe("DynamoAuditStore", () => {
    it("writes one item keyed by audit id, with a TTL", async () => {
      const send = vi.fn().mockResolvedValue({});
      const store = new DynamoAuditStore({
        tableName: "sitedoc_audits",
        client: client(send),
        ttlDays: 30,
      });

      await store.save(base);

      const item = send.mock.calls[0][0].input.Item;
      expect(send.mock.calls[0][0].input.TableName).toBe("sitedoc_audits");
      expect(item.pk.S).toBe(`AUDIT#${base.id}`);
      expect(item.sk.S).toBe("META");
      expect(item.status.S).toBe("completed");
      expect(item.record.B).toBeInstanceOf(Uint8Array);
      expect(Number(item.ttl.N)).toBe(
        Math.floor(Date.parse(base.createdAt) / 1000) + 30 * 24 * 60 * 60,
      );
    });

    it("reads and decompresses a stored record", async () => {
      const { bytes } = encodeRecord(base);
      const send = vi.fn().mockResolvedValue({
        Item: { pk: { S: `AUDIT#${base.id}` }, sk: { S: "META" }, record: { B: bytes } },
      });
      const store = new DynamoAuditStore({ tableName: "t", client: client(send) });

      expect(await store.get(base.id)).toEqual(base);
    });

    it("returns null when the item does not exist", async () => {
      const send = vi.fn().mockResolvedValue({});
      const store = new DynamoAuditStore({ tableName: "t", client: client(send) });

      expect(await store.get(base.id)).toBeNull();
    });
  });
  ```

- [x] **Step 3: Run test and verify it fails**

  Run: `npx vitest run src/lib/store/dynamo-store.test.ts`
  Expected: FAIL — cannot resolve `@/lib/store/dynamo-store`.

- [x] **Step 4: Add the `truncated` field to the record type**

  In `src/lib/audit-types.ts`, inside `AuditRecord` (after `summary`):

  ```ts
    /**
     * Set when the record had to be shed to fit the store's item limit. Not
     * rendered — it exists so a surprising report can be explained.
     */
    truncated?: true;
  ```

- [x] **Step 5: Implement**

  Create `src/lib/store/dynamo-store.ts`:

  ```ts
  import { gunzipSync, gzipSync } from "node:zlib";
  import {
    DynamoDBClient,
    GetItemCommand,
    PutItemCommand,
  } from "@aws-sdk/client-dynamodb";
  import type { AuditRecord, AuditSeverity } from "@/lib/audit-types";
  import type { AuditStore } from "@/lib/store/types";

  /**
   * DynamoDB's hard item limit is 400 KB. We stop well short of it so a record
   * near the boundary cannot fail the write outright.
   */
  const MAX_COMPRESSED_BYTES = 350_000;

  const SEVERITY_RANK: Record<AuditSeverity, number> = { High: 0, Medium: 1, Low: 2 };

  function compress(record: AuditRecord): Uint8Array {
    return new Uint8Array(gzipSync(Buffer.from(JSON.stringify(record), "utf8")));
  }

  /**
   * Serialize a record for storage, gzipped.
   *
   * Records are ~10 KB and compress ~3:1, so this normally just shrinks the
   * write. A pathological target site can still overflow, so oversized records
   * are shed in a fixed order — deterministic, and the highest-value content
   * (scores, summary, severe issues) survives.
   */
  export function encodeRecord(record: AuditRecord): {
    bytes: Uint8Array;
    truncated: boolean;
  } {
    let bytes = compress(record);
    if (bytes.byteLength <= MAX_COMPRESSED_BYTES) return { bytes, truncated: false };

    const bySeverity = (issues: AuditRecord["issues"]) =>
      [...issues].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

    const steps: Array<(r: AuditRecord) => AuditRecord> = [
      (r) => ({ ...r, consoleErrors: r.consoleErrors.slice(0, 100) }),
      (r) => ({ ...r, failedRequests: r.failedRequests.slice(0, 100) }),
      (r) => ({ ...r, consoleErrors: [], failedRequests: [] }),
      (r) => ({ ...r, issues: bySeverity(r.issues).slice(0, 100) }),
      (r) => ({ ...r, issues: bySeverity(r.issues).slice(0, 25) }),
    ];

    let candidate: AuditRecord = { ...record, truncated: true };
    for (const step of steps) {
      candidate = step(candidate);
      bytes = compress(candidate);
      if (bytes.byteLength <= MAX_COMPRESSED_BYTES) break;
    }

    console.warn(
      `[dynamo-store] record ${record.id} truncated to ${bytes.byteLength} bytes`,
    );

    return { bytes, truncated: true };
  }

  export function decodeRecord(bytes: Uint8Array): AuditRecord {
    return JSON.parse(gunzipSync(Buffer.from(bytes)).toString("utf8")) as AuditRecord;
  }

  /**
   * DynamoDB-backed {@link AuditStore}. One item per audit, keyed by id: every
   * access pattern in the app is "get this audit" or "overwrite this audit", so
   * there is no index and no query.
   */
  export class DynamoAuditStore implements AuditStore {
    private readonly client: DynamoDBClient;
    private readonly tableName: string;
    private readonly ttlSeconds: number;

    constructor(options: {
      tableName: string;
      client?: DynamoDBClient;
      ttlDays?: number;
    }) {
      this.tableName = options.tableName;
      this.client = options.client ?? new DynamoDBClient({});
      this.ttlSeconds = (options.ttlDays ?? 30) * 24 * 60 * 60;
    }

    async save(record: AuditRecord): Promise<void> {
      const { bytes } = encodeRecord(record);
      const createdAt = Date.parse(record.createdAt);
      const expiresAt =
        Math.floor((Number.isNaN(createdAt) ? Date.now() : createdAt) / 1000) +
        this.ttlSeconds;

      await this.client.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: {
            pk: { S: `AUDIT#${record.id}` },
            sk: { S: "META" },
            status: { S: record.status },
            record: { B: bytes },
            ttl: { N: String(expiresAt) },
          },
        }),
      );
    }

    async get(id: string): Promise<AuditRecord | null> {
      const result = await this.client.send(
        new GetItemCommand({
          TableName: this.tableName,
          Key: { pk: { S: `AUDIT#${id}` }, sk: { S: "META" } },
        }),
      );

      const stored = result.Item?.record?.B;
      if (!stored) return null;

      return decodeRecord(stored);
    }
  }
  ```

- [x] **Step 6: Run test and verify it passes**

  Run: `npx vitest run src/lib/store/dynamo-store.test.ts`
  Expected: PASS (6 tests).

- [x] **Step 7: Wire the selector**

  In `src/lib/store/index.ts`:

  ```ts
  import { DynamoAuditStore } from "@/lib/store/dynamo-store";

  const storeKind = process.env["AUDIT_STORE"];

  export const auditStore: AuditStore =
    storeKind === "dynamo"
      ? new DynamoAuditStore({ tableName: process.env["SITEDOC_TABLE"] ?? "sitedoc_audits" })
      : new LocalAuditStore();
  ```

- [x] **Step 8: Verify**

  Run: `npm test && npm run typecheck && npm run build`
  Expected: PASS. Local development is unaffected — `AUDIT_STORE` is unset.

- [x] **Step 9: Stage (do NOT commit)**

  ```bash
  git add src/lib/store src/lib/audit-types.ts package.json package-lock.json
  ```

---

### Task 12: `S3ArtifactStore`

**Files:**
- Create: `src/lib/store/s3-artifact-store.ts`
- Create: `src/lib/store/s3-artifact-store.test.ts`
- Modify: `src/lib/store/index.ts`
- Modify: `package.json` (`@aws-sdk/client-s3`)

**Interfaces:**
- Produces:
  - `class S3ArtifactStore implements ArtifactStore` — constructor
    `({ bucket, client?, stagingRoot? })`.
  - `SITEDOC_ARTIFACTS=s3` + `SITEDOC_ARTIFACT_BUCKET` environment contract.
- Consumes: `ArtifactStore` (Task 1).

- [x] **Step 1: Add the dependency**

  ```bash
  npm install @aws-sdk/client-s3
  ```

- [x] **Step 2: Write failing test**

  Create `src/lib/store/s3-artifact-store.test.ts`:

  ```ts
  // @vitest-environment node
  import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
  import { tmpdir } from "node:os";
  import path from "node:path";
  import { describe, expect, it, vi } from "vitest";
  import { S3ArtifactStore } from "@/lib/store/s3-artifact-store";

  function store(send: ReturnType<typeof vi.fn>, stagingRoot: string) {
    return new S3ArtifactStore({
      bucket: "sitedoc-artifacts",
      client: { send } as never,
      stagingRoot,
    });
  }

  describe("S3ArtifactStore", () => {
    it("stages in a writable temp directory, because /var/task is read-only", () => {
      const s = store(vi.fn(), "/tmp");

      expect(s.stagingDirectory("abc")).toBe(path.join("/tmp", "abc"));
    });

    it("returns the CloudFront path shape, matching the local store", () => {
      expect(store(vi.fn(), "/tmp").urlFor("abc", "desktop.png")).toBe(
        "/artifacts/abc/desktop.png",
      );
    });

    it("uploads each staged file under the audit prefix, immutably cached", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "sitedoc-s3-"));
      await mkdir(path.join(root, "abc"), { recursive: true });
      await writeFile(path.join(root, "abc", "desktop.png"), "png-bytes");
      await writeFile(path.join(root, "abc", "mobile.png"), "png-bytes");
      const send = vi.fn().mockResolvedValue({});

      await store(send, root).publish("abc", ["desktop.png", "mobile.png"]);

      expect(send).toHaveBeenCalledTimes(2);
      const first = send.mock.calls[0][0].input;
      expect(first.Bucket).toBe("sitedoc-artifacts");
      expect(first.Key).toBe("audits/abc/desktop.png");
      expect(first.ContentType).toBe("image/png");
      expect(first.CacheControl).toBe("public, max-age=31536000, immutable");
    });

    it("propagates an upload failure so the scan is marked failed", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "sitedoc-s3-"));
      await mkdir(path.join(root, "abc"), { recursive: true });
      await writeFile(path.join(root, "abc", "desktop.png"), "png-bytes");
      const send = vi.fn().mockRejectedValue(new Error("AccessDenied"));

      await expect(store(send, root).publish("abc", ["desktop.png"])).rejects.toThrow(
        "AccessDenied",
      );
    });
  });
  ```

- [x] **Step 3: Run test and verify it fails**

  Run: `npx vitest run src/lib/store/s3-artifact-store.test.ts`
  Expected: FAIL — cannot resolve `@/lib/store/s3-artifact-store`.

- [x] **Step 4: Implement**

  Create `src/lib/store/s3-artifact-store.ts`:

  ```ts
  import { readFile } from "node:fs/promises";
  import path from "node:path";
  import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
  import type { ArtifactStore } from "@/lib/store/artifact-types";

  const CONTENT_TYPES: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
  };

  /**
   * S3-backed {@link ArtifactStore}.
   *
   * Staging happens in `/tmp` because a Lambda's deployment directory is
   * read-only; `publish` then uploads. Screenshots are immutable once written —
   * an audit id is never reused — so they get a one-year immutable cache header
   * and are served from CloudFront's edge rather than through any compute.
   */
  export class S3ArtifactStore implements ArtifactStore {
    private readonly client: S3Client;
    private readonly bucket: string;
    private readonly stagingRoot: string;

    constructor(options: { bucket: string; client?: S3Client; stagingRoot?: string }) {
      this.bucket = options.bucket;
      this.client = options.client ?? new S3Client({});
      this.stagingRoot = options.stagingRoot ?? "/tmp";
    }

    stagingDirectory(auditId: string): string {
      return path.join(this.stagingRoot, auditId);
    }

    async publish(auditId: string, files: string[]): Promise<void> {
      const dir = this.stagingDirectory(auditId);

      for (const file of files) {
        const body = await readFile(path.join(dir, file));

        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: `audits/${auditId}/${file}`,
            Body: body,
            ContentType: CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );
      }
    }

    urlFor(auditId: string, file: string): string {
      return `/artifacts/${auditId}/${file}`;
    }
  }
  ```

- [x] **Step 5: Run test and verify it passes**

  Run: `npx vitest run src/lib/store/s3-artifact-store.test.ts`
  Expected: PASS (4 tests).

- [x] **Step 6: Wire the selector**

  In `src/lib/store/index.ts`:

  ```ts
  import { S3ArtifactStore } from "@/lib/store/s3-artifact-store";

  export const artifactStore: ArtifactStore =
    process.env["SITEDOC_ARTIFACTS"] === "s3"
      ? new S3ArtifactStore({
          bucket: process.env["SITEDOC_ARTIFACT_BUCKET"] ?? "",
        })
      : new LocalArtifactStore();
  ```

- [x] **Step 7: Verify**

  Run: `npm test && npm run typecheck`
  Expected: PASS.

- [x] **Step 8: Stage (do NOT commit)**

  ```bash
  git add src/lib/store package.json package-lock.json
  ```

---

### Task 13: `SqsDispatcher`

**Files:**
- Create: `src/lib/audit/sqs-dispatcher.ts`
- Create: `src/lib/audit/sqs-dispatcher.test.ts`
- Modify: `src/lib/audit/dispatch.ts`
- Modify: `package.json` (`@aws-sdk/client-sqs`)

**Interfaces:**
- Produces:
  - `class SqsDispatcher implements AuditDispatcher` — constructor
    `({ queueUrl, client? })`.
  - `SITEDOC_DISPATCH=sqs` + `SITEDOC_QUEUE_URL` environment contract.
- Consumes: `AuditDispatcher`, `AuditJob` (Task 3).

- [x] **Step 1: Add the dependency**

  ```bash
  npm install @aws-sdk/client-sqs
  ```

- [x] **Step 2: Write failing test**

  Create `src/lib/audit/sqs-dispatcher.test.ts`:

  ```ts
  // @vitest-environment node
  import { describe, expect, it, vi } from "vitest";
  import type { AuditJob } from "@/lib/audit/job-queue";
  import { SqsDispatcher } from "@/lib/audit/sqs-dispatcher";

  const job: AuditJob = {
    auditId: "11111111-1111-4111-8111-111111111111",
    url: "https://example.com/",
    language: "vi",
    startedAt: "2026-08-05T00:00:00.000Z",
  };

  describe("SqsDispatcher", () => {
    it("sends the job as the message body, on the configured queue", async () => {
      const send = vi.fn().mockResolvedValue({ MessageId: "m1" });
      const dispatcher = new SqsDispatcher({
        queueUrl: "https://sqs.us-east-1.amazonaws.com/1/sitedoc-scan",
        client: { send } as never,
      });

      await dispatcher.dispatch(job);

      const input = send.mock.calls[0][0].input;
      expect(input.QueueUrl).toBe("https://sqs.us-east-1.amazonaws.com/1/sitedoc-scan");
      expect(JSON.parse(input.MessageBody)).toEqual(job);
    });

    it("propagates a send failure so the caller can return 500", async () => {
      const send = vi.fn().mockRejectedValue(new Error("throttled"));
      const dispatcher = new SqsDispatcher({ queueUrl: "q", client: { send } as never });

      await expect(dispatcher.dispatch(job)).rejects.toThrow("throttled");
    });
  });
  ```

- [x] **Step 3: Run test and verify it fails**

  Run: `npx vitest run src/lib/audit/sqs-dispatcher.test.ts`
  Expected: FAIL — cannot resolve `@/lib/audit/sqs-dispatcher`.

- [x] **Step 4: Implement**

  Create `src/lib/audit/sqs-dispatcher.ts`:

  ```ts
  import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
  import type { AuditDispatcher } from "@/lib/audit/dispatch";
  import type { AuditJob } from "@/lib/audit/job-queue";

  /**
   * Hands the job to SQS for the scan worker to pick up.
   *
   * This is the piece a long-lived container gave us for free: Lambda freezes
   * execution once the response is sent, so "run it in the background" has to
   * become a real queue. The upside is retries and a dead-letter queue, which the
   * in-process version never had.
   */
  export class SqsDispatcher implements AuditDispatcher {
    private readonly client: SQSClient;
    private readonly queueUrl: string;

    constructor(options: { queueUrl: string; client?: SQSClient }) {
      this.queueUrl = options.queueUrl;
      this.client = options.client ?? new SQSClient({});
    }

    async dispatch(job: AuditJob): Promise<void> {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(job),
        }),
      );
    }
  }
  ```

- [x] **Step 5: Run test and verify it passes**

  Run: `npx vitest run src/lib/audit/sqs-dispatcher.test.ts`
  Expected: PASS (2 tests).

- [x] **Step 6: Wire the selector**

  In `src/lib/audit/dispatch.ts`, replace the `auditDispatcher` export:

  ```ts
  const MAX_CONCURRENT_SCANS = Number(process.env.SITEDOC_MAX_CONCURRENT_SCANS) || 2;

  function createDispatcher(): AuditDispatcher {
    if (process.env["SITEDOC_DISPATCH"] === "sqs") {
      // Lazy require so the local path never loads the AWS SDK.
      const { SqsDispatcher } = require("@/lib/audit/sqs-dispatcher") as
        typeof import("@/lib/audit/sqs-dispatcher");

      return new SqsDispatcher({ queueUrl: process.env["SITEDOC_QUEUE_URL"] ?? "" });
    }

    return new InProcessDispatcher(new ConcurrencyQueue(MAX_CONCURRENT_SCANS), productionDeps);
  }

  export const auditDispatcher: AuditDispatcher = createDispatcher();
  ```

  If the project's ESLint config forbids `require`, use a top-level static import
  of `SqsDispatcher` instead and accept that the SDK is loaded in both paths — it
  is `external` in the zip bundle anyway.

- [x] **Step 7: Verify**

  Run: `./node_modules/.bin/eslint . && npm test && npm run typecheck`
  Expected: PASS.

- [x] **Step 8: Stage (do NOT commit)**

  ```bash
  git add src/lib/audit package.json package-lock.json
  ```

---

### Task 14: `lambda/secrets.ts` — SSM hydration

**Files:**
- Create: `lambda/secrets.ts`
- Create: `lambda/secrets.test.ts`
- Modify: `package.json` (`@aws-sdk/client-ssm`)

**Interfaces:**
- Produces: `hydrateSecrets(names?: string[]): Promise<void>` and
  `resetSecretsForTests(): void`.
- Environment contract: `SSM_PREFIX` (e.g. `/sitedoc-ai/`). Absent means do
  nothing.

- [x] **Step 1: Add the dependency**

  ```bash
  npm install @aws-sdk/client-ssm
  ```

- [x] **Step 2: Write failing test**

  Create `lambda/secrets.test.ts`:

  ```ts
  // @vitest-environment node
  import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

  const send = vi.fn();
  vi.mock("@aws-sdk/client-ssm", () => ({
    SSMClient: class { send = send; },
    GetParametersCommand: class { constructor(public readonly input: unknown) {} },
  }));

  const { hydrateSecrets, resetSecretsForTests } = await import("./secrets");

  beforeEach(() => {
    send.mockReset();
    resetSecretsForTests();
    delete process.env.SSM_PREFIX;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });
  afterEach(() => resetSecretsForTests());

  describe("hydrateSecrets", () => {
    it("does nothing without SSM_PREFIX, so local dev uses real env vars", async () => {
      await hydrateSecrets();

      expect(send).not.toHaveBeenCalled();
    });

    it("fetches only the missing parameters, in one call", async () => {
      process.env.SSM_PREFIX = "/sitedoc-ai/";
      process.env.ANTHROPIC_API_KEY = "already-set";
      send.mockResolvedValue({
        Parameters: [{ Name: "/sitedoc-ai/OPENAI_API_KEY", Value: "from-ssm" }],
      });

      await hydrateSecrets();

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        Names: ["/sitedoc-ai/OPENAI_API_KEY"],
        WithDecryption: true,
      });
      expect(process.env.OPENAI_API_KEY).toBe("from-ssm");
      expect(process.env.ANTHROPIC_API_KEY).toBe("already-set");
    });

    it("only calls SSM once across invocations, because the container is reused", async () => {
      process.env.SSM_PREFIX = "/sitedoc-ai/";
      send.mockResolvedValue({ Parameters: [] });

      await hydrateSecrets();
      await hydrateSecrets();

      expect(send).toHaveBeenCalledOnce();
    });

    it("does not throw when SSM is unavailable — AI falls back deterministically", async () => {
      process.env.SSM_PREFIX = "/sitedoc-ai/";
      send.mockRejectedValue(new Error("AccessDenied"));

      await expect(hydrateSecrets()).resolves.toBeUndefined();
    });
  });
  ```

- [x] **Step 3: Run test and verify it fails**

  Run: `npx vitest run lambda/secrets.test.ts`
  Expected: FAIL — cannot resolve `./secrets`.

- [x] **Step 4: Implement**

  Create `lambda/secrets.ts`:

  ```ts
  import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";

  const SECRET_NAMES = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"];

  let hydrated: Promise<void> | undefined;

  /**
   * Copy secrets from SSM Parameter Store into `process.env` before anything
   * reads them.
   *
   * Gating rules, each one deliberate:
   *  - No `SSM_PREFIX` means do nothing, so local development and tests keep
   *    using real environment variables and never touch AWS.
   *  - A variable that is already populated is never requested, so an explicit
   *    override always wins.
   *  - Everything still missing is fetched in ONE `GetParameters` call.
   *  - Failure is swallowed: AI enrichment falls back deterministically, and a
   *    missing key must not fail an otherwise good audit.
   */
  export async function hydrateSecrets(names: string[] = SECRET_NAMES): Promise<void> {
    hydrated ??= (async () => {
      const prefix = process.env["SSM_PREFIX"];
      if (!prefix) return;

      const missing = names.filter((name) => !process.env[name]);
      if (missing.length === 0) return;

      const client = new SSMClient({});

      try {
        const result = await client.send(
          new GetParametersCommand({
            Names: missing.map((name) => `${prefix.replace(/\/$/, "")}/${name}`),
            WithDecryption: true,
          }),
        );

        for (const parameter of result.Parameters ?? []) {
          const key = parameter.Name?.split("/").pop();
          if (key && parameter.Value) process.env[key] = parameter.Value;
        }
      } catch (error) {
        console.error("[secrets] could not read from SSM:", error);
      }
    })();

    return hydrated;
  }

  /** Test-only: clear the module-scoped memo. */
  export function resetSecretsForTests(): void {
    hydrated = undefined;
  }
  ```

- [x] **Step 5: Run test and verify it passes**

  Run: `npx vitest run lambda/secrets.test.ts`
  Expected: PASS (4 tests).

- [x] **Step 6: Stage (do NOT commit)**

  ```bash
  git add lambda package.json package-lock.json
  ```

---

### Task 15: Lambda handlers

**Files:**
- Create: `lambda/http.ts`
- Create: `lambda/api.ts`
- Create: `lambda/api.test.ts`
- Create: `lambda/scan.ts`
- Create: `lambda/scan.test.ts`
- Create: `lambda/pdf.ts`
- Create: `lambda/pdf.test.ts`

**Interfaces:**
- Produces:
  - `lambda/http.ts`: `type FunctionUrlEvent`, `type FunctionUrlResult`,
    `json(status, body)`, `binary(status, bytes, headers)`.
  - `lambda/api.ts`: `handler(event: FunctionUrlEvent): Promise<FunctionUrlResult>`
  - `lambda/scan.ts`: `handler(event: SQSEvent): Promise<{ batchItemFailures: {itemIdentifier: string}[] }>`
  - `lambda/pdf.ts`: `handler(event: FunctionUrlEvent): Promise<FunctionUrlResult>`
- Consumes: `createAudit`/`getAudit` (Task 5), `renderReportPdf` (Task 6),
  `runAuditJob`/`productionDeps` (Task 3), `auditStore`, `hydrateSecrets` (Task 14).

- [x] **Step 1: Write the shared HTTP helpers**

  Create `lambda/http.ts`:

  ```ts
  /**
   * Lambda Function URL payload format 2.0, narrowed to what these handlers use.
   * Hand-written rather than pulled from `@types/aws-lambda`: three fields do not
   * justify a dependency, and this documents exactly what we rely on.
   */
  export type FunctionUrlEvent = {
    requestContext: { http: { method: string; path: string } };
    rawPath?: string;
    rawQueryString?: string;
    queryStringParameters?: Record<string, string | undefined>;
    headers?: Record<string, string | undefined>;
    body?: string;
    isBase64Encoded?: boolean;
  };

  export type FunctionUrlResult = {
    statusCode: number;
    headers?: Record<string, string>;
    body?: string;
    isBase64Encoded?: boolean;
  };

  export function json(status: number, body: unknown): FunctionUrlResult {
    return {
      statusCode: status,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    };
  }

  export function binary(
    status: number,
    bytes: Uint8Array,
    headers: Record<string, string>,
  ): FunctionUrlResult {
    return {
      statusCode: status,
      headers,
      body: Buffer.from(bytes).toString("base64"),
      isBase64Encoded: true,
    };
  }

  /** Decode a Function URL request body, which may be base64-encoded. */
  export function readJsonBody(event: FunctionUrlEvent): unknown {
    if (!event.body) return {};

    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;

    return JSON.parse(raw);
  }
  ```

- [x] **Step 2: Write failing tests for the API handler**

  Create `lambda/api.test.ts`:

  ```ts
  // @vitest-environment node
  import { beforeEach, describe, expect, it, vi } from "vitest";

  vi.mock("@/lib/api/audits", () => ({
    createAudit: vi.fn(async () => ({ status: 202, body: { id: "new" } })),
    getAudit: vi.fn(async () => ({ status: 200, body: { id: "known" } })),
  }));

  const { createAudit, getAudit } = await import("@/lib/api/audits");
  const { handler } = await import("./api");

  function event(over: Record<string, unknown> = {}) {
    return {
      requestContext: { http: { method: "GET", path: "/api/audits" } },
      ...over,
    } as never;
  }

  beforeEach(() => vi.clearAllMocks());

  describe("api handler", () => {
    it("dispatches POST /api/audits to createAudit", async () => {
      const res = await handler(
        event({
          requestContext: { http: { method: "POST", path: "/api/audits" } },
          body: JSON.stringify({ url: "https://example.com", language: "en" }),
        }),
      );

      expect(res.statusCode).toBe(202);
      expect(createAudit).toHaveBeenCalledWith({ url: "https://example.com", language: "en" });
    });

    it("decodes a base64-encoded body", async () => {
      await handler(
        event({
          requestContext: { http: { method: "POST", path: "/api/audits" } },
          body: Buffer.from(JSON.stringify({ url: "https://x.test" })).toString("base64"),
          isBase64Encoded: true,
        }),
      );

      expect(createAudit).toHaveBeenCalledWith({ url: "https://x.test", language: undefined });
    });

    it("returns 400 for a malformed body", async () => {
      const res = await handler(
        event({
          requestContext: { http: { method: "POST", path: "/api/audits" } },
          body: "{nope",
        }),
      );

      expect(res.statusCode).toBe(400);
      expect(createAudit).not.toHaveBeenCalled();
    });

    it("dispatches GET /api/audits?id= to getAudit", async () => {
      const res = await handler(event({ queryStringParameters: { id: "known" } }));

      expect(res.statusCode).toBe(200);
      expect(getAudit).toHaveBeenCalledWith("known");
    });

    it("404s an unknown route", async () => {
      const res = await handler(
        event({ requestContext: { http: { method: "GET", path: "/api/nope" } } }),
      );

      expect(res.statusCode).toBe(404);
    });

    it("405s an unsupported method", async () => {
      const res = await handler(
        event({ requestContext: { http: { method: "DELETE", path: "/api/audits" } } }),
      );

      expect(res.statusCode).toBe(405);
    });
  });
  ```

- [x] **Step 3: Run and verify it fails**

  Run: `npx vitest run lambda/api.test.ts`
  Expected: FAIL — cannot resolve `./api`.

- [x] **Step 4: Implement the API handler**

  Create `lambda/api.ts`:

  ```ts
  import { createAudit, getAudit } from "@/lib/api/audits";
  import { json, readJsonBody, type FunctionUrlEvent, type FunctionUrlResult } from "./http";

  /**
   * The interactive endpoint. Deliberately a small zip on the managed Node
   * runtime rather than the Chromium container image: this is the request a user
   * waits on, and it must cold-start in milliseconds.
   */
  export async function handler(event: FunctionUrlEvent): Promise<FunctionUrlResult> {
    const { method, path } = event.requestContext.http;

    if (path !== "/api/audits") return json(404, { error: "Not found." });

    if (method === "POST") {
      let payload: unknown;
      try {
        payload = readJsonBody(event);
      } catch {
        return json(400, { error: "Request body must be valid JSON." });
      }

      const input = (payload ?? {}) as { url?: unknown; language?: unknown };
      const result = await createAudit({ url: input.url, language: input.language });

      return json(result.status, result.body);
    }

    if (method === "GET") {
      const result = await getAudit(event.queryStringParameters?.id ?? null);

      return json(result.status, result.body);
    }

    return json(405, { error: "Method not allowed." });
  }
  ```

- [x] **Step 5: Run and verify it passes**

  Run: `npx vitest run lambda/api.test.ts`
  Expected: PASS (6 tests).

- [x] **Step 6: Write failing tests for the scan worker**

  Create `lambda/scan.test.ts`:

  ```ts
  // @vitest-environment node
  import { beforeEach, describe, expect, it, vi } from "vitest";

  vi.mock("@/lib/audit/job-queue", () => ({
    runAuditJob: vi.fn(async () => undefined),
    productionDeps: { save: vi.fn(), scan: vi.fn(), enrich: vi.fn(), now: vi.fn() },
  }));
  vi.mock("@/lib/store", () => ({ auditStore: { get: vi.fn(async () => null) } }));
  vi.mock("./secrets", () => ({ hydrateSecrets: vi.fn(async () => undefined) }));

  const { runAuditJob } = await import("@/lib/audit/job-queue");
  const { auditStore } = await import("@/lib/store");
  const { hydrateSecrets } = await import("./secrets");
  const { handler } = await import("./scan");

  const job = {
    auditId: "11111111-1111-4111-8111-111111111111",
    url: "https://example.com/",
    language: "en",
    startedAt: "2026-08-05T00:00:00.000Z",
  };

  function sqsEvent(bodies: unknown[]) {
    return {
      Records: bodies.map((body, i) => ({
        messageId: `m${i}`,
        body: JSON.stringify(body),
      })),
    } as never;
  }

  beforeEach(() => vi.clearAllMocks());

  describe("scan handler", () => {
    it("hydrates secrets before running the job", async () => {
      await handler(sqsEvent([job]));

      expect(hydrateSecrets).toHaveBeenCalledOnce();
      expect(runAuditJob).toHaveBeenCalledOnce();
    });

    it("reports no failures on success", async () => {
      expect(await handler(sqsEvent([job]))).toEqual({ batchItemFailures: [] });
    });

    it("skips a job whose record already completed, because SQS is at-least-once", async () => {
      vi.mocked(auditStore.get).mockResolvedValue({ status: "completed" } as never);

      await handler(sqsEvent([job]));

      expect(runAuditJob).not.toHaveBeenCalled();
    });

    it("returns the message id as a batch item failure when the job throws", async () => {
      vi.mocked(runAuditJob).mockRejectedValue(new Error("chromium died"));

      expect(await handler(sqsEvent([job]))).toEqual({
        batchItemFailures: [{ itemIdentifier: "m0" }],
      });
    });

    it("fails only the malformed message, not the batch", async () => {
      const event = {
        Records: [
          { messageId: "bad", body: "{not json" },
          { messageId: "good", body: JSON.stringify(job) },
        ],
      } as never;

      expect(await handler(event)).toEqual({
        batchItemFailures: [{ itemIdentifier: "bad" }],
      });
      expect(runAuditJob).toHaveBeenCalledOnce();
    });
  });
  ```

- [x] **Step 7: Run and verify it fails**

  Run: `npx vitest run lambda/scan.test.ts`
  Expected: FAIL — cannot resolve `./scan`.

- [x] **Step 8: Implement the scan worker**

  Create `lambda/scan.ts`:

  ```ts
  import { productionDeps, runAuditJob, type AuditJob } from "@/lib/audit/job-queue";
  import { auditStore } from "@/lib/store";
  import { hydrateSecrets } from "./secrets";

  type SQSEvent = { Records: Array<{ messageId: string; body: string }> };
  type SQSBatchResponse = { batchItemFailures: Array<{ itemIdentifier: string }> };

  /**
   * The scan worker. Runs the same `runAuditJob` the container used, with the
   * same dependencies — the whole point of that seam.
   *
   * Partial batch failures are reported so one bad message cannot force SQS to
   * redeliver its healthy neighbors. Event source concurrency is capped in
   * Terraform, not here.
   */
  export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
    await hydrateSecrets();

    const batchItemFailures: Array<{ itemIdentifier: string }> = [];

    for (const record of event.Records) {
      let job: AuditJob;

      try {
        job = JSON.parse(record.body) as AuditJob;
      } catch {
        // Unparseable message: fail it so it lands in the DLQ for inspection.
        console.error(`[scan] message ${record.messageId} is not valid JSON`);
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      try {
        // Standard queues are at-least-once, so a duplicate delivery is normal.
        // A completed record means the work is already done; a second Chromium
        // run would just burn the free tier.
        const existing = await auditStore.get(job.auditId);
        if (existing?.status === "completed") {
          console.log(`[scan] ${job.auditId} already completed, skipping`);
          continue;
        }

        // `runAuditJob` never throws by contract — it persists a `failed` record
        // instead. A throw here therefore means an infrastructure fault, which is
        // exactly what should be retried and eventually dead-lettered.
        await runAuditJob(job, productionDeps);
      } catch (error) {
        console.error(`[scan] ${job.auditId} failed:`, error);
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  }
  ```

- [x] **Step 9: Run and verify it passes**

  Run: `npx vitest run lambda/scan.test.ts`
  Expected: PASS (5 tests).

- [x] **Step 10: Write failing tests for the PDF handler**

  Create `lambda/pdf.test.ts`:

  ```ts
  // @vitest-environment node
  import { beforeEach, describe, expect, it, vi } from "vitest";

  const send = vi.fn();
  vi.mock("@aws-sdk/client-ssm", () => ({
    SSMClient: class { send = send; },
    GetParameterCommand: class { constructor(public readonly input: unknown) {} },
  }));
  vi.mock("@/lib/api/pdf", () => ({
    renderReportPdf: vi.fn(async () => ({ status: 200, pdf: new Uint8Array([37, 80]) })),
  }));

  const { renderReportPdf } = await import("@/lib/api/pdf");
  const { handler, resetBaseUrlForTests } = await import("./pdf");

  const id = "11111111-1111-4111-8111-111111111111";

  function event(path: string) {
    return { requestContext: { http: { method: "GET", path } } } as never;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetBaseUrlForTests();
    process.env.SITEDOC_BASE_URL_PARAM = "/sitedoc-ai/public-base-url";
    send.mockResolvedValue({ Parameter: { Value: "https://d1.cloudfront.net" } });
  });

  describe("pdf handler", () => {
    it("reads the base URL from SSM and renders the report", async () => {
      const res = await handler(event(`/pdf/${id}`));

      expect(res.statusCode).toBe(200);
      expect(res.isBase64Encoded).toBe(true);
      expect(renderReportPdf).toHaveBeenCalledWith({
        id,
        baseUrl: "https://d1.cloudfront.net",
      });
    });

    it("caches the base URL across invocations", async () => {
      await handler(event(`/pdf/${id}`));
      await handler(event(`/pdf/${id}`));

      expect(send).toHaveBeenCalledOnce();
    });

    it("sets a download filename", async () => {
      const res = await handler(event(`/pdf/${id}`));

      expect(res.headers?.["content-disposition"]).toBe(
        `attachment; filename="sitedoc-${id}.pdf"`,
      );
    });

    it("passes a render failure through as JSON", async () => {
      vi.mocked(renderReportPdf).mockResolvedValue({ status: 404, error: "Report not found." });

      const res = await handler(event(`/pdf/${id}`));

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body ?? "{}")).toEqual({ error: "Report not found." });
    });

    it("500s when the base URL cannot be resolved", async () => {
      send.mockRejectedValue(new Error("AccessDenied"));

      expect((await handler(event(`/pdf/${id}`))).statusCode).toBe(500);
    });

    it("404s a path that is not /pdf/<id>", async () => {
      expect((await handler(event("/pdf/"))).statusCode).toBe(404);
    });
  });
  ```

- [x] **Step 11: Run and verify it fails**

  Run: `npx vitest run lambda/pdf.test.ts`
  Expected: FAIL — cannot resolve `./pdf`.

- [x] **Step 12: Implement the PDF handler**

  Create `lambda/pdf.ts`:

  ```ts
  import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
  import { renderReportPdf } from "@/lib/api/pdf";
  import { binary, json, type FunctionUrlEvent, type FunctionUrlResult } from "./http";

  let baseUrl: Promise<string> | undefined;

  /**
   * Resolve the public base URL the renderer should navigate.
   *
   * It comes from SSM rather than an environment variable because the CloudFront
   * distribution depends on this function's URL, so Terraform cannot set the
   * domain as an env var without a dependency cycle. Reading it at runtime breaks
   * the cycle. Memoized in module scope, so a warm container reads it once.
   *
   * Rejected alternative: deriving it from the request `Host` header. That would
   * put viewer-influenced input into the URL a headless browser then visits.
   */
  function resolveBaseUrl(): Promise<string> {
    baseUrl ??= (async () => {
      const explicit = process.env["PUBLIC_BASE_URL"];
      if (explicit) return explicit;

      const name = process.env["SITEDOC_BASE_URL_PARAM"];
      if (!name) throw new Error("SITEDOC_BASE_URL_PARAM is not configured.");

      const result = await new SSMClient({}).send(new GetParameterCommand({ Name: name }));
      const value = result.Parameter?.Value;
      if (!value) throw new Error(`SSM parameter ${name} is empty.`);

      return value;
    })();

    return baseUrl;
  }

  /** Test-only: clear the module-scoped memo. */
  export function resetBaseUrlForTests(): void {
    baseUrl = undefined;
  }

  export async function handler(event: FunctionUrlEvent): Promise<FunctionUrlResult> {
    const { path } = event.requestContext.http;
    const id = path.startsWith("/pdf/") ? path.slice("/pdf/".length) : "";

    if (!id) return json(404, { error: "Not found." });

    let resolved: string;
    try {
      resolved = await resolveBaseUrl();
    } catch (error) {
      console.error("[pdf] could not resolve the base URL:", error);
      return json(500, { error: "Could not generate the PDF report." });
    }

    const result = await renderReportPdf({ id, baseUrl: resolved });

    if (!result.pdf) return json(result.status, { error: result.error });

    return binary(200, result.pdf, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="sitedoc-${id}.pdf"`,
      "cache-control": "no-store",
    });
  }
  ```

- [x] **Step 13: Run and verify it passes**

  Run: `npx vitest run lambda/pdf.test.ts`
  Expected: PASS (6 tests).

- [x] **Step 14: Full verification gate**

  ```bash
  ./node_modules/.bin/eslint . && npm run typecheck && npm test && npm run build
  ```
  Expected: all pass.

- [x] **Step 15: Stage (do NOT commit)**

  ```bash
  git add lambda
  ```

---

### Task 16: Bundling and the Lambda container image

**Files:**
- Create: `esbuild.config.mjs`
- Create: `Dockerfile.lambda`
- Create: `.dockerignore` (if absent) / Modify existing
- Modify: `package.json` (`bundle:lambda` script)

**Interfaces:**
- Produces:
  - `npm run bundle:lambda` → `dist-lambda/{api,scan,pdf}/index.js`
  - `Dockerfile.lambda` → an image whose `CMD` selects `scan.handler` or
    `pdf.handler`.
- Consumes: all three handlers (Task 15).

- [x] **Step 1: Write the bundler config**

  Create `esbuild.config.mjs`:

  ```js
  import { build } from "esbuild";

  /**
   * Bundles each Lambda entry point separately.
   *
   * Two different externals policies, on purpose:
   *  - `api` runs on the managed `nodejs22.x` runtime, which ships AWS SDK v3,
   *    so bundling the SDK would add megabytes of cold-start weight for nothing.
   *  - `scan` and `pdf` run on a Playwright base image that has NO AWS SDK, so
   *    the SDK must be bundled. `playwright` stays external there because it has
   *    to resolve from the image, next to its browser binaries.
   *
   * `scan`/`pdf` target node20 as a safe floor for the Playwright image's own
   * Node; raise it once the image's version is confirmed.
   */
  const shared = {
    bundle: true,
    platform: "node",
    format: "cjs",
    minify: true,
    sourcemap: true,
    logLevel: "info",
  };

  const targets = [
    {
      name: "api",
      entry: "lambda/api.ts",
      target: "node22",
      external: ["@aws-sdk/*"],
    },
    {
      name: "scan",
      entry: "lambda/scan.ts",
      target: "node20",
      external: ["playwright", "playwright-core"],
    },
    {
      name: "pdf",
      entry: "lambda/pdf.ts",
      target: "node20",
      external: ["playwright", "playwright-core"],
    },
  ];

  await Promise.all(
    targets.map(({ name, entry, target, external }) =>
      build({
        ...shared,
        entryPoints: [entry],
        outfile: `dist-lambda/${name}/index.js`,
        target,
        external,
      }),
    ),
  );
  ```

- [x] **Step 2: Add the script and bundle**

  In `package.json`:

  ```json
  "bundle:lambda": "node esbuild.config.mjs"
  ```

  Run:
  ```bash
  npm run bundle:lambda
  ls -la dist-lambda/api dist-lambda/scan dist-lambda/pdf
  ```
  Expected: three `index.js` files. Confirm the `@/` alias resolved — esbuild does
  not read `tsconfig.json` paths unless told to. If it fails with
  "Could not resolve @/lib/...", add to `shared`:

  ```js
    tsconfig: "tsconfig.json",
  ```

  and if that is still insufficient, add an explicit alias:

  ```js
    alias: { "@": new URL("./src", import.meta.url).pathname },
  ```

- [x] **Step 3: Verify the bundles load**

  ```bash
  node -e 'const m=require("./dist-lambda/api/index.js"); console.log(typeof m.handler)'
  node -e 'const m=require("./dist-lambda/scan/index.js"); console.log(typeof m.handler)'
  node -e 'const m=require("./dist-lambda/pdf/index.js"); console.log(typeof m.handler)'
  ```
  Expected: `function` three times. `api` will warn about missing `@aws-sdk/*` —
  that is correct, the runtime provides them. If it *throws*, install the SDK
  locally as a devDependency for this check or accept the warning.

- [x] **Step 4: Ignore build output**

  Add to `.gitignore`:

  ```
  dist-lambda/
  out/
  ```

- [x] **Step 5: Write the container image**

  Create `Dockerfile.lambda`:

  ```dockerfile
  # syntax=docker/dockerfile:1

  # Same Playwright base as the Render image: audit scores are browser-dependent,
  # so the deployed Chromium must be the build the test suite was written against.
  ARG PLAYWRIGHT_VERSION=v1.60.0-jammy

  # --- Builder: compile the Lambda Runtime Interface Client ------------------
  # `aws-lambda-ric` is a native module, so it needs a toolchain the runtime image
  # should not carry.
  FROM mcr.microsoft.com/playwright:${PLAYWRIGHT_VERSION} AS ric-builder

  RUN apt-get update && apt-get install -y --no-install-recommends \
        cmake g++ make python3 \
      && rm -rf /var/lib/apt/lists/*

  WORKDIR /build
  RUN npm init -y && npm install aws-lambda-ric@3

  # --- Runtime --------------------------------------------------------------
  FROM mcr.microsoft.com/playwright:${PLAYWRIGHT_VERSION}

  ENV NODE_ENV=production \
      AUDIT_STORE=dynamo \
      SITEDOC_ARTIFACTS=s3 \
      SITEDOC_AXE_DIR=/var/task/node_modules/axe-core

  WORKDIR /var/task

  COPY --from=ric-builder /build/node_modules ./node_modules

  # Playwright and axe-core resolve from disk at runtime, so they are copied
  # rather than bundled. axe-core is read from SITEDOC_AXE_DIR (see
  # src/lib/audit/accessibility.ts); Playwright needs to sit next to its browsers.
  COPY node_modules/playwright ./node_modules/playwright
  COPY node_modules/playwright-core ./node_modules/playwright-core
  COPY node_modules/axe-core ./node_modules/axe-core

  # Both handlers ship in one image; the Lambda's image_config.command picks one.
  COPY dist-lambda/scan/index.js ./scan.js
  COPY dist-lambda/pdf/index.js ./pdf.js

  ENTRYPOINT ["/usr/local/bin/npx", "aws-lambda-ric"]
  CMD ["scan.handler"]
  ```

- [x] **Step 6: Keep the image small**

  Create or extend `.dockerignore`:

  ```
  .git
  .data
  .next
  out
  node_modules/.cache
  docs
  e2e
  test-results
  playwright-report
  ```

  Note `node_modules` is **not** ignored — the image copies three packages from
  it. Run `npm ci` before building.

- [x] **Step 7: Build the image and check its size**

  ```bash
  npm run bundle:lambda
  docker build -f Dockerfile.lambda -t sitedoc-browser:local .
  docker images sitedoc-browser:local
  ```
  Expected: a successful build. Record the size — it drives the ECR cost estimate
  and the scan worker's first cold start. If it exceeds ~2.5 GB, check whether the
  Playwright base is shipping browsers other than Chromium and prune them.

- [x] **Step 8: Verify the handler runs under the Runtime Interface Emulator**

  ```bash
  docker run --rm -d --name sitedoc-rie -p 9000:8080 \
    -e AUDIT_STORE=local \
    --entrypoint /usr/local/bin/npx \
    sitedoc-browser:local aws-lambda-ric scan.handler
  sleep 3
  curl -s -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" \
    -d '{"Records":[{"messageId":"m0","body":"{not json"}]}'
  docker logs sitedoc-rie | tail -20
  docker rm -f sitedoc-rie
  ```

  Expected: the response is `{"batchItemFailures":[{"itemIdentifier":"m0"}]}`.
  A deliberately malformed message is used so the check needs no AWS access — it
  proves the RIC is wired and the handler is reachable, which is the actual
  unknown here. (The official emulator image is
  `public.ecr.aws/lambda/nodejs` based; if `aws-lambda-ric` alone does not accept
  invocations, install `aws-lambda-rie` in the image and front the entrypoint with
  it — this is spec risk #2 and this step is where it surfaces.)

- [x] **Step 9: Verify Chromium actually launches inside the image**

  ```bash
  docker run --rm --entrypoint node sitedoc-browser:local -e '
  const { chromium } = require("/var/task/node_modules/playwright");
  chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] })
    .then(async (b) => { console.log("launched", await b.version()); await b.close(); })
    .catch((e) => { console.error("FAILED", e); process.exit(1); });'
  ```
  Expected: `launched <chromium version>`. Record the version — it must match the
  local `npx playwright --version` Chromium, per the global constraints.

- [x] **Step 10: Final verification gate**

  ```bash
  ./node_modules/.bin/eslint . && npm run typecheck && npm test && \
    npm run build && npm run bundle:lambda && npx playwright test
  ```
  Expected: all pass.

- [x] **Step 11: Stage (do NOT commit)**

  ```bash
  git add esbuild.config.mjs Dockerfile.lambda .dockerignore .gitignore package.json
  ```

- [x] **Step 12: Run the code review pass**

  Invoke the `code-reviewer` subagent over the full staged diff. Address anything
  it raises before declaring this plan complete. Then hand off to the maintainer:
  report what is staged, what was verified, and the measured image size and
  Chromium version from Steps 7 and 9.

---

## Plan Self-Review

**Spec coverage.** Spec §5.1 → Tasks 1, 3, 11, 12, 13. §5.2 → Tasks 5, 6, 14, 15,
16. §5.3 → Task 2. §5.4 → Tasks 9, 10. §5.5 → Tasks 6, 9. §5.6 → verified in
Task 5's tests (the SSRF rejection case). §3.5 gzip/TTL/size-guard → Task 11.
§3.7 SQLite removal → Task 4. §6 local dev and testing → Tasks 7, 8, 10.
§8 parity, poll timeout → Task 8. §12 phasing → the phase headings.

**Known gaps, deliberately deferred to the infrastructure plan:** spec §4
(CloudFront, IAM, DynamoDB and SQS provisioning), §7 (Terraform, OIDC, deploy
workflow), §9 (cutover, Render decommissioning), §10 (cost verification),
§11 risk 1 (OAC with `POST` bodies — unverifiable without a distribution),
§13 (`README.md` / `AGENTS.md` updates, which land with the cutover).

**Sequencing hazards recorded in the plan text rather than left to be discovered:**
the artifact URL flip is pinned to Task 10 Step 1 (not Task 1); Task 6 Step 6
notes that PDF verification legitimately fails until Task 9 adds
`data-report-ready`; Task 3 Step 4 requires a dynamic import to avoid a circular
dependency; Task 7 Step 4 must widen vitest's `include` before any `lambda/` or
`scripts/` test can be collected.

**Type consistency check.** `ArtifactStore` (Task 1) is implemented by
`LocalArtifactStore` (Task 1) and `S3ArtifactStore` (Task 12) with identical
three-method shapes. `AuditDispatcher.dispatch` (Task 3) matches `SqsDispatcher`
(Task 13). `ApiResult<T>` (Task 5) is consumed unchanged by `lambda/api.ts`
(Task 15) and `scripts/local-server.ts` (Task 7). `PdfResult` (Task 6) is
consumed by `lambda/pdf.ts` (Task 15) and the local server. `productionDeps` is
exported in Task 3 and consumed in Task 15. `data-report-ready="true"` is written
in Task 9 and awaited by the exact same selector string in Task 6.
