// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/audits", () => ({
  createAudit: vi.fn(async () => ({ status: 202, body: { id: "new" } })),
  getAudit: vi.fn(async () => ({ status: 200, body: { id: "known" } })),
}));

const { createAudit, getAudit } = await import("@/lib/api/audits");
const { handler } = await import("./api");

function event(over: Record<string, unknown> = {}) {
  return {
    requestContext: { http: { method: "GET", path: "/api/audits" } },
    ...over,
  } as never;
}

beforeEach(() => vi.clearAllMocks());

describe("api handler", () => {
  it("dispatches POST /api/audits to createAudit", async () => {
    const res = await handler(
      event({
        requestContext: { http: { method: "POST", path: "/api/audits" } },
        body: JSON.stringify({ url: "https://example.com", language: "en" }),
      }),
    );

    expect(res.statusCode).toBe(202);
    expect(createAudit).toHaveBeenCalledWith({ url: "https://example.com", language: "en" });
  });

  it("decodes a base64-encoded body", async () => {
    await handler(
      event({
        requestContext: { http: { method: "POST", path: "/api/audits" } },
        body: Buffer.from(JSON.stringify({ url: "https://x.test" })).toString("base64"),
        isBase64Encoded: true,
      }),
    );

    expect(createAudit).toHaveBeenCalledWith({ url: "https://x.test", language: undefined });
  });

  it("returns 400 for a malformed body", async () => {
    const res = await handler(
      event({
        requestContext: { http: { method: "POST", path: "/api/audits" } },
        body: "{nope",
      }),
    );

    expect(res.statusCode).toBe(400);
    expect(createAudit).not.toHaveBeenCalled();
  });

  it("dispatches GET /api/audits?id= to getAudit", async () => {
    const res = await handler(event({ queryStringParameters: { id: "known" } }));

    expect(res.statusCode).toBe(200);
    expect(getAudit).toHaveBeenCalledWith("known");
  });

  it("404s an unknown route", async () => {
    const res = await handler(
      event({ requestContext: { http: { method: "GET", path: "/api/nope" } } }),
    );

    expect(res.statusCode).toBe(404);
  });

  it("405s an unsupported method", async () => {
    const res = await handler(
      event({ requestContext: { http: { method: "DELETE", path: "/api/audits" } } }),
    );

    expect(res.statusCode).toBe(405);
  });
});
