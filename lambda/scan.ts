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
