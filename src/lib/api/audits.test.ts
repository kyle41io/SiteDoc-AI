import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", () => ({
  auditStore: { save: vi.fn().mockResolvedValue(undefined), get: vi.fn() },
}));
vi.mock("@/lib/audit/job-queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audit/job-queue")>()),
  enqueueAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/url-validation", () => ({
  validatePublicHttpUrl: vi.fn(),
}));

const { auditStore } = await import("@/lib/store");
const { enqueueAudit } = await import("@/lib/audit/job-queue");
const { validatePublicHttpUrl } = await import("@/lib/url-validation");
const { createAudit, getAudit } = await import("@/lib/api/audits");

beforeEach(() => {
  vi.mocked(validatePublicHttpUrl).mockResolvedValue("https://example.com/");
  vi.mocked(auditStore.get).mockReset();
  vi.mocked(auditStore.save).mockClear();
  vi.mocked(enqueueAudit).mockClear();
});

describe("createAudit", () => {
  it("persists a queued record, dispatches the job, and returns 202", async () => {
    const result = await createAudit({ url: "example.com", language: "vi" });

    expect(result.status).toBe(202);
    expect(auditStore.save).toHaveBeenCalledOnce();
    expect(enqueueAudit).toHaveBeenCalledOnce();
    expect(result.body).toMatchObject({ status: "queued", language: "vi" });
  });

  it("rejects a URL the SSRF guard refuses, without dispatching", async () => {
    vi.mocked(validatePublicHttpUrl).mockRejectedValue(new Error("Private address."));

    const result = await createAudit({ url: "http://169.254.169.254/", language: "en" });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Private address." });
    expect(enqueueAudit).not.toHaveBeenCalled();
  });

  it("falls back to English for an unknown language", async () => {
    const result = await createAudit({ url: "example.com", language: "kl" });

    expect(result.body).toMatchObject({ language: "en" });
  });
});

describe("getAudit", () => {
  it("returns 400 when the id is missing", async () => {
    expect(await getAudit(null)).toEqual({
      status: 400,
      body: { error: "Audit id is required." },
    });
  });

  it("returns 400 when the id is not an audit id", async () => {
    expect(await getAudit("../etc/passwd")).toEqual({
      status: 400,
      body: { error: "Audit id is invalid." },
    });
  });

  it("returns 404 when the record does not exist", async () => {
    vi.mocked(auditStore.get).mockResolvedValue(null);

    const result = await getAudit("11111111-1111-4111-8111-111111111111");

    expect(result.status).toBe(404);
  });

  it("returns 500 when the store throws", async () => {
    vi.mocked(auditStore.get).mockRejectedValue(new Error("disk gone"));

    const result = await getAudit("11111111-1111-4111-8111-111111111111");

    expect(result).toEqual({
      status: 500,
      body: { error: "The audit record could not be read." },
    });
  });

  it("returns the record on success", async () => {
    const record = { id: "11111111-1111-4111-8111-111111111111", status: "completed" };
    vi.mocked(auditStore.get).mockResolvedValue(record as never);

    expect(await getAudit(record.id)).toEqual({ status: 200, body: record });
  });
});
