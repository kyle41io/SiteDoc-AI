import type { AuditRecord } from "@/lib/audit-types";

/**
 * Storage abstraction for audit records. The local filesystem implementation
 * is the default for development; a database-backed implementation (Prisma /
 * Postgres) can be swapped in later without changing any callers.
 */
export interface AuditStore {
  /** Persist (create or overwrite) an audit record. */
  save(record: AuditRecord): Promise<void>;
  /** Fetch an audit record by id, or `null` if it does not exist. */
  get(id: string): Promise<AuditRecord | null>;
}
