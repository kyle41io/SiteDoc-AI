import { describe, expect, it, vi } from "vitest";
import type { AuditRecord } from "@/lib/audit-types";
import { ConcurrencyQueue, runAuditJob, type AuditJob, type RunAuditDeps } from "./job-queue";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const job: AuditJob = {
  auditId: "9e09db39-501b-4160-841f-3fadb5983a06",
  url: "https://example.com",
  language: "en",
  startedAt: "2026-06-12T00:00:00.000Z",
};

describe("ConcurrencyQueue", () => {
  it("runs at most maxConcurrent tasks at once and drains the rest", async () => {
    const q = new ConcurrencyQueue(2);
    const defs = Array.from({ length: 4 }, () => deferred());
    let running = 0;
    let maxSeen = 0;

    defs.forEach((d) => {
      q.add(async () => {
        running += 1;
        maxSeen = Math.max(maxSeen, running);
        await d.promise;
        running -= 1;
      });
    });

    expect(q.activeCount).toBe(2);
    expect(q.pendingCount).toBe(2);

    defs.forEach((d) => d.resolve());
    await vi.waitFor(() => expect(q.activeCount).toBe(0));
    expect(q.pendingCount).toBe(0);
    expect(maxSeen).toBe(2);
  });
});

describe("runAuditJob", () => {
  const completed: AuditRecord = {
    id: job.auditId,
    url: job.url,
    status: "completed",
    language: "en",
    createdAt: job.startedAt,
    completedAt: "2026-06-12T00:00:05.000Z",
    screenshots: {},
    consoleErrors: [],
    failedRequests: [],
    issues: [],
    metrics: [],
    scores: { overall: 90, scanner: 100, console: 100, network: 100 },
    summary: "done",
  };

  function deps(overrides: Partial<RunAuditDeps> = {}) {
    const saves: AuditRecord[] = [];
    const base: RunAuditDeps = {
      save: async (r) => {
        saves.push(structuredClone(r));
      },
      scan: async () => completed,
      enrich: async (r) => ({
        ...r,
        ai: { source: "fallback", executiveSummary: "x", topIssues: [], recommendations: [], generatedAt: "t" },
      }),
      now: () => "2026-06-12T00:00:05.000Z",
      ...overrides,
    };
    return { saves, deps: base };
  }

  it("persists running then completed (enriched) on success", async () => {
    const { saves, deps: d } = deps();
    await runAuditJob(job, d);
    expect(saves.map((s) => s.status)).toEqual(["running", "completed"]);
    expect(saves[1].ai?.source).toBe("fallback");
  });

  it("persists running then failed when the scan throws (never rejects)", async () => {
    const { saves, deps: d } = deps({
      scan: async () => {
        throw new Error("boom");
      },
    });
    await expect(runAuditJob(job, d)).resolves.toBeUndefined();
    expect(saves.map((s) => s.status)).toEqual(["running", "failed"]);
    expect(saves[1].error).toBe("boom");
    expect(saves[1].completedAt).toBe("2026-06-12T00:00:05.000Z");
  });
});
