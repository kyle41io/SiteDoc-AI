import { LocalAuditStore } from "@/lib/store/local-store";
import { SqliteAuditStore } from "@/lib/store/sqlite-store";
import type { AuditStore } from "@/lib/store/types";

export type { AuditStore } from "@/lib/store/types";
export {
  getAuditArtifactDirectory,
  getAuditArtifactUrl,
} from "@/lib/store/local-store";

/**
 * The active audit store. Defaults to the local filesystem JSON store (no native
 * deps in dev/tests); set `AUDIT_STORE=sqlite` for a durable SQLite store that
 * survives restarts (used in the container deploy). Screenshots remain on disk
 * regardless — see the artifact helpers in `local-store`.
 */
// Bracket access so Next's bundler does NOT inline this at build time — dot
// access (`process.env.AUDIT_STORE`) gets statically replaced with the build-time
// value, which would freeze the selection. We need the runtime value.
const storeKind = process.env["AUDIT_STORE"];

export const auditStore: AuditStore =
  storeKind === "sqlite" ? new SqliteAuditStore() : new LocalAuditStore();
