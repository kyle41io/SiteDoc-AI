// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const page = {
  emulateMedia: vi.fn().mockResolvedValue(undefined),
  goto: vi.fn().mockResolvedValue(undefined),
  waitForSelector: vi.fn().mockResolvedValue(undefined),
  evaluate: vi.fn().mockResolvedValue(undefined),
  pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4")),
};
const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };

vi.mock("playwright", () => ({ chromium: { launch: vi.fn(async () => browser) } }));
vi.mock("@/lib/store", () => ({ auditStore: { get: vi.fn() } }));

const { auditStore } = await import("@/lib/store");
const { renderReportPdf, PDF_WIDTH_PX } = await import("@/lib/api/pdf");

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auditStore.get).mockResolvedValue({ id, status: "completed" } as never);
});

describe("renderReportPdf", () => {
  it("rejects an invalid id before launching a browser", async () => {
    const result = await renderReportPdf({ id: "nope", baseUrl: "https://x.test" });

    expect(result.status).toBe(400);
    expect(browser.newPage).not.toHaveBeenCalled();
  });

  it("returns 404 for a report that is not completed", async () => {
    vi.mocked(auditStore.get).mockResolvedValue({ id, status: "running" } as never);

    expect((await renderReportPdf({ id, baseUrl: "https://x.test" })).status).toBe(404);
  });

  it("navigates the print view on the given base URL", async () => {
    await renderReportPdf({ id, baseUrl: "https://d1.cloudfront.net" });

    expect(page.goto).toHaveBeenCalledWith(
      `https://d1.cloudfront.net/report/${id}?print=1`,
      expect.objectContaining({ waitUntil: "networkidle" }),
    );
  });

  it("waits for the client-rendered report to signal readiness", async () => {
    await renderReportPdf({ id, baseUrl: "https://x.test" });

    expect(page.waitForSelector).toHaveBeenCalledWith(
      "[data-report-ready='true']",
      expect.any(Object),
    );
  });

  it("lays the page out at the printable A4 width", async () => {
    await renderReportPdf({ id, baseUrl: "https://x.test" });

    expect(browser.newPage).toHaveBeenCalledWith({
      viewport: { width: PDF_WIDTH_PX, height: 1123 },
    });
  });

  it("returns the rendered bytes and always closes the browser", async () => {
    const result = await renderReportPdf({ id, baseUrl: "https://x.test" });

    expect(result.status).toBe(200);
    expect(result.pdf).toBeInstanceOf(Uint8Array);
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("returns 500 and still closes the browser when rendering throws", async () => {
    page.pdf.mockRejectedValueOnce(new Error("boom"));

    const result = await renderReportPdf({ id, baseUrl: "https://x.test" });

    expect(result.status).toBe(500);
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
