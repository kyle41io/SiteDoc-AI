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

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` clears calls but keeps implementations, so the defaults are
  // restored explicitly — otherwise one test's override leaks into the next.
  vi.mocked(auditStore.get).mockResolvedValue(null);
  vi.mocked(runAuditJob).mockResolvedValue(undefined);
});

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
