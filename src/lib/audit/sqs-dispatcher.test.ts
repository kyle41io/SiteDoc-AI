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
