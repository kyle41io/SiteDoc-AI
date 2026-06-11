import { LocalAuditStore } from "@/lib/store/local-store";
import type { AuditStore } from "@/lib/store/types";

export type { AuditStore } from "@/lib/store/types";
export {
  getAuditArtifactDirectory,
  getAuditArtifactUrl,
} from "@/lib/store/local-store";

/**
 * The active audit store for the app. Defaults to the local filesystem store;
 * swap this for a database-backed store in a later phase.
 */
export const auditStore: AuditStore = new LocalAuditStore();
