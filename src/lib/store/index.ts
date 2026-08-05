import type { ArtifactStore } from "@/lib/store/artifact-types";
import { DynamoAuditStore } from "@/lib/store/dynamo-store";
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
 * deployed functions.
 *
 * Bracket access so Next's bundler does NOT inline this at build time — dot
 * access gets statically replaced with the build-time value, which would freeze
 * the selection. We need the runtime value.
 */
const storeKind = process.env["AUDIT_STORE"];

export const auditStore: AuditStore =
  storeKind === "dynamo"
    ? new DynamoAuditStore({ tableName: process.env["SITEDOC_TABLE"] ?? "sitedoc_audits" })
    : new LocalAuditStore();
