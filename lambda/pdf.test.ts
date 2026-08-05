// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class { send = send; },
  GetParameterCommand: class { constructor(public readonly input: unknown) {} },
}));
vi.mock("@/lib/api/pdf", () => ({
  renderReportPdf: vi.fn(async () => ({ status: 200, pdf: new Uint8Array([37, 80]) })),
}));

const { renderReportPdf } = await import("@/lib/api/pdf");
const { handler, resetBaseUrlForTests } = await import("./pdf");

const id = "11111111-1111-4111-8111-111111111111";

function event(path: string) {
  return { requestContext: { http: { method: "GET", path } } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBaseUrlForTests();
  process.env.SITEDOC_BASE_URL_PARAM = "/sitedoc-ai/public-base-url";
  send.mockResolvedValue({ Parameter: { Value: "https://d1.cloudfront.net" } });
  vi.mocked(renderReportPdf).mockResolvedValue({
    status: 200,
    pdf: new Uint8Array([37, 80]),
  });
});

describe("pdf handler", () => {
  it("reads the base URL from SSM and renders the report", async () => {
    const res = await handler(event(`/pdf/${id}`));

    expect(res.statusCode).toBe(200);
    expect(res.isBase64Encoded).toBe(true);
    expect(renderReportPdf).toHaveBeenCalledWith({
      id,
      baseUrl: "https://d1.cloudfront.net",
    });
  });

  it("caches the base URL across invocations", async () => {
    await handler(event(`/pdf/${id}`));
    await handler(event(`/pdf/${id}`));

    expect(send).toHaveBeenCalledOnce();
  });

  it("sets a download filename", async () => {
    const res = await handler(event(`/pdf/${id}`));

    expect(res.headers?.["content-disposition"]).toBe(
      `attachment; filename="sitedoc-${id}.pdf"`,
    );
  });

  it("passes a render failure through as JSON", async () => {
    vi.mocked(renderReportPdf).mockResolvedValue({ status: 404, error: "Report not found." });

    const res = await handler(event(`/pdf/${id}`));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body ?? "{}")).toEqual({ error: "Report not found." });
  });

  it("500s when the base URL cannot be resolved", async () => {
    send.mockRejectedValue(new Error("AccessDenied"));

    expect((await handler(event(`/pdf/${id}`))).statusCode).toBe(500);
  });

  it("404s a path that is not /pdf/<id>", async () => {
    expect((await handler(event("/pdf/"))).statusCode).toBe(404);
  });
});
