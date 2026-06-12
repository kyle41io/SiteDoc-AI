/**
 * True when `value` is a canonical UUID (v1-5). Used to validate audit ids
 * coming from request params before hitting the store, in both the API route
 * and the `/report/[id]` page so they share one definition.
 */
export function isAuditId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
