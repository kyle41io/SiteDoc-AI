// @vitest-environment node
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import type { AuditRecord } from "@/lib/audit-types";
import {
  DynamoAuditStore,
  decodeRecord,
  encodeRecord,
} from "@/lib/store/dynamo-store";

const base: AuditRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  url: "https://example.com/",
  status: "completed",
  language: "en",
  createdAt: "2026-08-05T00:00:00.000Z",
  screenshots: { desktop: "/artifacts/x/desktop.png", mobile: "/artifacts/x/mobile.png" },
  consoleErrors: [],
  failedRequests: [],
  issues: [],
  metrics: [],
  scores: { overall: 90, scanner: 92, console: 88, network: 90 },
  summary: "ok",
};

function client(send: ReturnType<typeof vi.fn>) {
  return { send } as unknown as ConstructorParameters<typeof DynamoAuditStore>[0]["client"];
}

describe("record encoding", () => {
  it("round-trips a record through gzip", () => {
    const { bytes, truncated } = encodeRecord(base);

    expect(truncated).toBe(false);
    expect(JSON.parse(gunzipSync(bytes).toString("utf8"))).toEqual(base);
    expect(decodeRecord(bytes)).toEqual(base);
  });

  it("compresses, so the stored bytes are smaller than the JSON", () => {
    const noisy: AuditRecord = {
      ...base,
      consoleErrors: Array.from({ length: 500 }, (_, i) => ({
        text: `Uncaught TypeError: cannot read property of undefined (${i})`,
        url: "https://example.com/app.js",
        lineNumber: i,
      })) as AuditRecord["consoleErrors"],
    };

    const { bytes } = encodeRecord(noisy);

    expect(bytes.byteLength).toBeLessThan(JSON.stringify(noisy).length / 2);
  });

  it("sheds console noise first when the compressed record is too large", () => {
    const huge: AuditRecord = {
      ...base,
      consoleErrors: Array.from({ length: 200_000 }, (_, i) => ({
        text: `error ${i} ${Math.random().toString(36)}`,
        url: `https://example.com/${i}`,
        lineNumber: i,
      })) as AuditRecord["consoleErrors"],
    };

    const { bytes, truncated } = encodeRecord(huge);
    const decoded = decodeRecord(bytes);

    expect(truncated).toBe(true);
    expect(bytes.byteLength).toBeLessThanOrEqual(350_000);
    expect(decoded.consoleErrors.length).toBeLessThan(200_000);
    expect(decoded.truncated).toBe(true);
    // Scores and summary are never shed — they are the point of the report.
    expect(decoded.scores).toEqual(base.scores);
    expect(decoded.summary).toBe("ok");
  });
});

describe("DynamoAuditStore", () => {
  it("writes one item keyed by audit id, with a TTL", async () => {
    const send = vi.fn().mockResolvedValue({});
    const store = new DynamoAuditStore({
      tableName: "sitedoc_audits",
      client: client(send),
      ttlDays: 30,
    });

    await store.save(base);

    const item = send.mock.calls[0][0].input.Item;
    expect(send.mock.calls[0][0].input.TableName).toBe("sitedoc_audits");
    expect(item.pk.S).toBe(`AUDIT#${base.id}`);
    expect(item.sk.S).toBe("META");
    expect(item.status.S).toBe("completed");
    expect(item.record.B).toBeInstanceOf(Uint8Array);
    expect(Number(item.ttl.N)).toBe(
      Math.floor(Date.parse(base.createdAt) / 1000) + 30 * 24 * 60 * 60,
    );
  });

  it("reads and decompresses a stored record", async () => {
    const { bytes } = encodeRecord(base);
    const send = vi.fn().mockResolvedValue({
      Item: { pk: { S: `AUDIT#${base.id}` }, sk: { S: "META" }, record: { B: bytes } },
    });
    const store = new DynamoAuditStore({ tableName: "t", client: client(send) });

    expect(await store.get(base.id)).toEqual(base);
  });

  it("returns null when the item does not exist", async () => {
    const send = vi.fn().mockResolvedValue({});
    const store = new DynamoAuditStore({ tableName: "t", client: client(send) });

    expect(await store.get(base.id)).toBeNull();
  });
});
