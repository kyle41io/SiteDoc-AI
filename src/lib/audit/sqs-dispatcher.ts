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
