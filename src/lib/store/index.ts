import type { ArtifactStore } from "@/lib/store/artifact-types";
import { LocalArtifactStore } from "@/lib/store/local-artifact-store";
import { LocalAuditStore } from "@/lib/store/local-store";
import type { AuditStore } from "@/lib/store/types";

export type { AuditStore } from "@/lib/store/types";
export type { ArtifactStore } from "@/lib/store/artifact-types";

/**
 * The active artifact store. Local disk by default; `SITEDOC_ARTIFACTS=s3`
 * selects object storage (added with the S3 implementation).
 */
export const artifactStore: ArtifactStore = new LocalArtifactStore();

/**
 * The active audit store. Defaults to the local filesystem JSON store (no
 * native deps in dev/tests); `AUDIT_STORE=dynamo` selects DynamoDB for the
 * deployed functions (wired with the Dynamo implementation).
 *
 * The selection is read with bracket access so Next's bundler does NOT inline
 * it at build time — dot access gets statically replaced with the build-time
 * value, which would freeze the selection. We need the runtime value.
 */
export const auditStore: AuditStore = new LocalAuditStore();
