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
    this.queue.add(() => runAuditJob(job, this.deps));
  }
}

const MAX_CONCURRENT_SCANS = Number(process.env.SITEDOC_MAX_CONCURRENT_SCANS) || 2;

export const auditDispatcher: AuditDispatcher = new InProcessDispatcher(
  new ConcurrencyQueue(MAX_CONCURRENT_SCANS),
  productionDeps,
);
