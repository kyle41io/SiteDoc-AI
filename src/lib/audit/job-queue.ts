import type { AuditRecord } from "@/lib/audit-types";
import { auditStore } from "@/lib/store";
import { auditStrings, type AuditStrings } from "@/lib/audit/audit-i18n";

/** The unit of work the queue processes. */
export type AuditJob = {
  auditId: string;
  url: string;
  language: string;
  /** ISO timestamp the audit was created (used as the record's createdAt). */
  startedAt: string;
};

/**
 * A minimal in-memory queue that runs at most `maxConcurrent` async tasks at
 * once; the rest wait. Fits a single long-lived server/container — no external
 * broker. The store/queue seams leave room to swap in a real broker later.
 */
export class ConcurrencyQueue {
  private active = 0;
  private readonly pending: Array<() => Promise<void>> = [];

  constructor(private readonly maxConcurrent: number) {}

  add(task: () => Promise<void>): void {
    this.pending.push(task);
    this.drain();
  }

  private drain(): void {
    while (this.active < this.maxConcurrent && this.pending.length > 0) {
      const task = this.pending.shift()!;
      this.active += 1;
      void task()
        .catch(() => {
          // Task-level errors are handled inside runAuditJob (it persists a
          // failed record); swallow here so one job can't wedge the queue.
        })
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }

  /** Number of tasks currently executing (for tests/observability). */
  get activeCount(): number {
    return this.active;
  }

  /** Number of tasks waiting for a free slot (for tests/observability). */
  get pendingCount(): number {
    return this.pending.length;
  }
}

/** Skeleton record for the pre-scan states (`queued`/`running`). */
function skeletonRecord(
  job: AuditJob,
  strings: AuditStrings,
  status: "queued" | "running",
): AuditRecord {
  return {
    id: job.auditId,
    url: job.url,
    status,
    language: job.language,
    createdAt: job.startedAt,
    screenshots: {},
    consoleErrors: [],
    failedRequests: [],
    issues: [],
    metrics: [],
    scores: { overall: 0, scanner: 0, console: 0, network: 0 },
    summary: strings.runningSummary,
  };
}

/** The `queued` record the route persists before enqueuing the job. */
export function queuedAuditRecord(job: AuditJob, strings: AuditStrings): AuditRecord {
  return skeletonRecord(job, strings, "queued");
}

/** Injected collaborators, so the transition logic is unit-testable. */
export type RunAuditDeps = {
  save: (record: AuditRecord) => Promise<void>;
  scan: (job: AuditJob) => Promise<AuditRecord>;
  enrich: (record: AuditRecord) => Promise<AuditRecord>;
  now: () => string;
};

/**
 * Run one audit to completion, persisting each state transition:
 * `running` → (`completed` | `failed`). Never throws — failures are recorded.
 */
export async function runAuditJob(job: AuditJob, deps: RunAuditDeps): Promise<void> {
  const strings = auditStrings(job.language);
  await deps.save(skeletonRecord(job, strings, "running"));

  try {
    const scanned = await deps.scan(job);
    const enriched = await deps.enrich(scanned);
    await deps.save(enriched);
  } catch (error) {
    // The record carries `error.message` for the user; the log carries the whole
    // thing for whoever has to debug it. Without this a browser crash in Lambda
    // shows up in CloudWatch as a successful 3-second invocation with no output.
    console.error(`[audit] ${job.auditId} failed:`, error);

    try {
      await deps.save({
        ...skeletonRecord(job, strings, "running"),
        status: "failed",
        completedAt: deps.now(),
        error: error instanceof Error ? error.message : "The scan failed.",
        summary: strings.failedSummary,
      });
    } catch {
      // Persisting the failed state itself failed (store/disk outage). Nothing
      // more we can do here; the client poller times out. Never rethrow so the
      // queue can't wedge and the never-throws contract holds.
    }
  }
}

// --- Production singleton ----------------------------------------------------

/**
 * Playwright and the AI providers are imported lazily, inside the collaborators
 * that use them. Only the scan worker ever runs these, and a static import would
 * drag Chromium's driver and both AI SDKs into the interactive API bundle — the
 * one request a user waits on.
 */
export const productionDeps: RunAuditDeps = {
  save: (record) => auditStore.save(record),
  scan: async (job) => {
    const { runPlaywrightScan } = await import("@/lib/playwright-scanner");

    return runPlaywrightScan({
      auditId: job.auditId,
      url: job.url,
      startedAt: job.startedAt,
      language: job.language,
    });
  },
  // AI enrichment is non-blocking and never throws (falls back deterministically).
  enrich: async (record) => {
    const { generateAiReport } = await import("@/lib/ai");

    return { ...record, ai: await generateAiReport(record) };
  },
  now: () => new Date().toISOString(),
};

/**
 * Enqueue an audit to run in the background. Returns once the job is accepted,
 * not once it finishes; progress is observed by polling the audit record.
 *
 * The import is dynamic to break the cycle: `dispatch` imports `productionDeps`
 * from this module. A static import here is a circular-import bug that only
 * shows up at runtime.
 */
export async function enqueueAudit(job: AuditJob): Promise<void> {
  const { auditDispatcher } = await import("@/lib/audit/dispatch");
  await auditDispatcher.dispatch(job);
}
