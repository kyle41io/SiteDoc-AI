/**
 * Hex SHA-256 of a request body, for the `x-amz-content-sha256` header.
 *
 * CloudFront signs origin requests to the Lambda Function URLs with SigV4 (origin
 * access control), and a SigV4 signature has to cover the payload. CloudFront will
 * not hash the body itself, and Lambda rejects unsigned payloads outright — so for
 * `POST`/`PUT` the *viewer* has to supply the hash and CloudFront folds it into the
 * signature. Without it the origin returns 403, which the distribution's
 * `403 -> /404.html` rule then disguises as a 404.
 *
 * Harmless everywhere else: the local dev server and the Next route handler ignore
 * the header.
 */
export async function payloadSha256(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
