/**
 * Lambda Function URL payload format 2.0, narrowed to what these handlers use.
 * Hand-written rather than pulled from `@types/aws-lambda`: three fields do not
 * justify a dependency, and this documents exactly what we rely on.
 */
export type FunctionUrlEvent = {
  requestContext: { http: { method: string; path: string } };
  rawPath?: string;
  rawQueryString?: string;
  queryStringParameters?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
};

export type FunctionUrlResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
};

export function json(status: number, body: unknown): FunctionUrlResult {
  return {
    statusCode: status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

export function binary(
  status: number,
  bytes: Uint8Array,
  headers: Record<string, string>,
): FunctionUrlResult {
  return {
    statusCode: status,
    headers,
    body: Buffer.from(bytes).toString("base64"),
    isBase64Encoded: true,
  };
}

/** Decode a Function URL request body, which may be base64-encoded. */
export function readJsonBody(event: FunctionUrlEvent): unknown {
  if (!event.body) return {};

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  return JSON.parse(raw);
}
