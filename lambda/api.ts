import { createAudit, getAudit } from "@/lib/api/audits";
import { json, readJsonBody, type FunctionUrlEvent, type FunctionUrlResult } from "./http";

/**
 * The interactive endpoint. Deliberately a small zip on the managed Node
 * runtime rather than the Chromium container image: this is the request a user
 * waits on, and it must cold-start in milliseconds.
 */
export async function handler(event: FunctionUrlEvent): Promise<FunctionUrlResult> {
  const { method, path } = event.requestContext.http;

  if (path !== "/api/audits") return json(404, { error: "Not found." });

  if (method === "POST") {
    let payload: unknown;
    try {
      payload = readJsonBody(event);
    } catch {
      return json(400, { error: "Request body must be valid JSON." });
    }

    const input = (payload ?? {}) as { url?: unknown; language?: unknown };
    const result = await createAudit({ url: input.url, language: input.language });

    return json(result.status, result.body);
  }

  if (method === "GET") {
    const result = await getAudit(event.queryStringParameters?.id ?? null);

    return json(result.status, result.body);
  }

  return json(405, { error: "Method not allowed." });
}
