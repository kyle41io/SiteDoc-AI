import {
  ConcurrencyQueue,
  productionDeps,
  runAuditJob,
  type AuditJob,
  type RunAuditDeps,
} from "@/lib/audit/job-queue";
import { SqsDispatcher } from "@/lib/audit/sqs-dispatcher";

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

/**
 * `SITEDOC_DISPATCH=sqs` in the deployed API function; anything else keeps the
 * in-process queue. Read with bracket access so the value is resolved at
 * runtime rather than inlined at build time.
 *
 * The SQS import is static because the lint config forbids `require`; the AWS
 * SDK is marked external in the zip bundle, so this costs nothing there.
 */
function createDispatcher(): AuditDispatcher {
  if (process.env["SITEDOC_DISPATCH"] === "sqs") {
    return new SqsDispatcher({ queueUrl: process.env["SITEDOC_QUEUE_URL"] ?? "" });
  }

  return new InProcessDispatcher(new ConcurrencyQueue(MAX_CONCURRENT_SCANS), productionDeps);
}

export const auditDispatcher: AuditDispatcher = createDispatcher();
