/**
 * Where the API lives, from the browser's point of view.
 *
 * Empty in production: the static export and the Lambda-backed API share one
 * CloudFront origin, so relative URLs work and there is no CORS anywhere. In
 * development the API is a separate process, so requests need an absolute base.
 *
 * Dot access is intentional here — `NEXT_PUBLIC_*` is inlined at build time by
 * design, which is exactly what a client bundle needs.
 */
const base = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${base}${path}`;
}
