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
