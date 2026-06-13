import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuditRecord } from "@/lib/audit-types";
import { SqliteAuditStore } from "./sqlite-store";

function record(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id: "9e09db39-501b-4160-841f-3fadb5983a06",
    url: "https://example.com",
    status: "completed",
    language: "en",
    createdAt: "2026-06-12T00:00:00.000Z",
    screenshots: {},
    consoleErrors: [],
    failedRequests: [],
    issues: [],
    metrics: [],
    scores: { overall: 88, scanner: 100, console: 100, network: 100 },
    summary: "ok",
    ...overrides,
  };
}

describe("SqliteAuditStore", () => {
  let dir: string;
  let store: SqliteAuditStore;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "sitedoc-sqlite-"));
    store = new SqliteAuditStore(dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null for a missing id", async () => {
    expect(await store.get("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("saves and retrieves a record round-trip", async () => {
    const r = record();
    await store.save(r);
    expect(await store.get(r.id)).toEqual(r);
  });

  it("overwrites an existing record on re-save (status transition)", async () => {
    await store.save(record({ status: "running", summary: "running" }));
    await store.save(record({ status: "completed", summary: "done" }));
    const got = await store.get("9e09db39-501b-4160-841f-3fadb5983a06");
    expect(got?.status).toBe("completed");
    expect(got?.summary).toBe("done");
  });

  it("persists across store instances pointing at the same dir", async () => {
    await store.save(record());
    const reopened = new SqliteAuditStore(dir);
    expect((await reopened.get(record().id))?.scores.overall).toBe(88);
  });
});
