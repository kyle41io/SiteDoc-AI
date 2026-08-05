import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { renderReportPdf } from "@/lib/api/pdf";
import { binary, json, type FunctionUrlEvent, type FunctionUrlResult } from "./http";

let baseUrl: Promise<string> | undefined;

/**
 * Resolve the public base URL the renderer should navigate.
 *
 * It comes from SSM rather than an environment variable because the CloudFront
 * distribution depends on this function's URL, so Terraform cannot set the
 * domain as an env var without a dependency cycle. Reading it at runtime breaks
 * the cycle. Memoized in module scope, so a warm container reads it once.
 *
 * Rejected alternative: deriving it from the request `Host` header. That would
 * put viewer-influenced input into the URL a headless browser then visits.
 */
function resolveBaseUrl(): Promise<string> {
  baseUrl ??= (async () => {
    const explicit = process.env["PUBLIC_BASE_URL"];
    if (explicit) return explicit;

    const name = process.env["SITEDOC_BASE_URL_PARAM"];
    if (!name) throw new Error("SITEDOC_BASE_URL_PARAM is not configured.");

    const result = await new SSMClient({}).send(new GetParameterCommand({ Name: name }));
    const value = result.Parameter?.Value;
    if (!value) throw new Error(`SSM parameter ${name} is empty.`);

    return value;
  })();

  return baseUrl;
}

/** Test-only: clear the module-scoped memo. */
export function resetBaseUrlForTests(): void {
  baseUrl = undefined;
}

export async function handler(event: FunctionUrlEvent): Promise<FunctionUrlResult> {
  const { path } = event.requestContext.http;
  const id = path.startsWith("/pdf/") ? path.slice("/pdf/".length) : "";

  if (!id) return json(404, { error: "Not found." });

  let resolved: string;
  try {
    resolved = await resolveBaseUrl();
  } catch (error) {
    console.error("[pdf] could not resolve the base URL:", error);
    return json(500, { error: "Could not generate the PDF report." });
  }

  const result = await renderReportPdf({ id, baseUrl: resolved });

  if (!result.pdf) return json(result.status, { error: result.error });

  return binary(200, result.pdf, {
    "content-type": "application/pdf",
    "content-disposition": `attachment; filename="sitedoc-${id}.pdf"`,
    "cache-control": "no-store",
  });
}
