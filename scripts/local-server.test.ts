// @vitest-environment node
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/audits", () => ({
  createAudit: vi.fn(async () => ({ status: 202, body: { id: "queued-id" } })),
  getAudit: vi.fn(async (id: string | null) =>
    id === "known"
      ? { status: 200, body: { id: "known" } }
      : { status: 404, body: { error: "Audit not found." } },
  ),
}));
vi.mock("@/lib/api/pdf", () => ({
  renderReportPdf: vi.fn(async () => ({ status: 200, pdf: new Uint8Array([1, 2]) })),
}));

const { createLocalServer } = await import("../scripts/local-server");

let base: string;
const server = createLocalServer({});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("local server", () => {
  it("routes POST /api/audits to createAudit", async () => {
    const res = await fetch(`${base}/api/audits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", language: "en" }),
    });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ id: "queued-id" });
  });

  it("rejects a malformed JSON body with 400", async () => {
    const res = await fetch(`${base}/api/audits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });

    expect(res.status).toBe(400);
  });

  it("routes GET /api/audits?id= to getAudit", async () => {
    expect((await fetch(`${base}/api/audits?id=known`)).status).toBe(200);
    expect((await fetch(`${base}/api/audits?id=missing`)).status).toBe(404);
  });

  it("serves a PDF at /pdf/:id", async () => {
    const res = await fetch(`${base}/pdf/11111111-1111-4111-8111-111111111111`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("404s an unknown path", async () => {
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
