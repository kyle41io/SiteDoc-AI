import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuditRecord } from "@/lib/audit-types";
import { LocalAuditStore } from "@/lib/store/local-store";

function makeRecord(id: string): AuditRecord {
  return {
    id,
    url: "https://example.com",
    status: "completed",
    createdAt: new Date(0).toISOString(),
    screenshots: {},
    consoleErrors: [],
    failedRequests: [],
    issues: [],
    metrics: [],
    scores: { overall: 88, scanner: 90, console: 92, network: 80 },
    summary: "ok",
  };
}

describe("LocalAuditStore", () => {
  let baseDir: string;
  let store: LocalAuditStore;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), "sitedoc-store-"));
    store = new LocalAuditStore(baseDir);
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("returns null for an unknown id", async () => {
    expect(await store.get("does-not-exist")).toBeNull();
  });

  it("round-trips a saved record", async () => {
    const record = makeRecord("abc-123");
    await store.save(record);
    expect(await store.get("abc-123")).toEqual(record);
  });

  it("overwrites an existing record on save", async () => {
    await store.save(makeRecord("dup"));
    await store.save({ ...makeRecord("dup"), status: "failed", summary: "boom" });

    const stored = await store.get("dup");
    expect(stored?.status).toBe("failed");
    expect(stored?.summary).toBe("boom");
  });
});
