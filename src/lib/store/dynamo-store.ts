import { gunzipSync, gzipSync } from "node:zlib";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import type { AuditRecord, AuditSeverity } from "@/lib/audit-types";
import type { AuditStore } from "@/lib/store/types";

/**
 * DynamoDB's hard item limit is 400 KB. We stop well short of it so a record
 * near the boundary cannot fail the write outright.
 */
const MAX_COMPRESSED_BYTES = 350_000;

const SEVERITY_RANK: Record<AuditSeverity, number> = { High: 0, Medium: 1, Low: 2 };

function compress(record: AuditRecord): Uint8Array {
  return new Uint8Array(gzipSync(Buffer.from(JSON.stringify(record), "utf8")));
}

/**
 * Serialize a record for storage, gzipped.
 *
 * Records are ~10 KB and compress ~3:1, so this normally just shrinks the
 * write. A pathological target site can still overflow, so oversized records
 * are shed in a fixed order — deterministic, and the highest-value content
 * (scores, summary, severe issues) survives.
 */
export function encodeRecord(record: AuditRecord): {
  bytes: Uint8Array;
  truncated: boolean;
} {
  let bytes = compress(record);
  if (bytes.byteLength <= MAX_COMPRESSED_BYTES) return { bytes, truncated: false };

  const bySeverity = (issues: AuditRecord["issues"]) =>
    [...issues].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const steps: Array<(r: AuditRecord) => AuditRecord> = [
    (r) => ({ ...r, consoleErrors: r.consoleErrors.slice(0, 100) }),
    (r) => ({ ...r, failedRequests: r.failedRequests.slice(0, 100) }),
    (r) => ({ ...r, consoleErrors: [], failedRequests: [] }),
    (r) => ({ ...r, issues: bySeverity(r.issues).slice(0, 100) }),
    (r) => ({ ...r, issues: bySeverity(r.issues).slice(0, 25) }),
  ];

  let candidate: AuditRecord = { ...record, truncated: true };
  for (const step of steps) {
    candidate = step(candidate);
    bytes = compress(candidate);
    if (bytes.byteLength <= MAX_COMPRESSED_BYTES) break;
  }

  console.warn(
    `[dynamo-store] record ${record.id} truncated to ${bytes.byteLength} bytes`,
  );

  return { bytes, truncated: true };
}

export function decodeRecord(bytes: Uint8Array): AuditRecord {
  return JSON.parse(gunzipSync(Buffer.from(bytes)).toString("utf8")) as AuditRecord;
}

/**
 * DynamoDB-backed {@link AuditStore}. One item per audit, keyed by id: every
 * access pattern in the app is "get this audit" or "overwrite this audit", so
 * there is no index and no query.
 */
export class DynamoAuditStore implements AuditStore {
  private readonly client: DynamoDBClient;
  private readonly tableName: string;
  private readonly ttlSeconds: number;

  constructor(options: {
    tableName: string;
    client?: DynamoDBClient;
    ttlDays?: number;
  }) {
    this.tableName = options.tableName;
    this.client = options.client ?? new DynamoDBClient({});
    this.ttlSeconds = (options.ttlDays ?? 30) * 24 * 60 * 60;
  }

  async save(record: AuditRecord): Promise<void> {
    const { bytes } = encodeRecord(record);
    const createdAt = Date.parse(record.createdAt);
    const expiresAt =
      Math.floor((Number.isNaN(createdAt) ? Date.now() : createdAt) / 1000) +
      this.ttlSeconds;

    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: {
          pk: { S: `AUDIT#${record.id}` },
          sk: { S: "META" },
          status: { S: record.status },
          record: { B: bytes },
          ttl: { N: String(expiresAt) },
        },
      }),
    );
  }

  async get(id: string): Promise<AuditRecord | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: { pk: { S: `AUDIT#${id}` }, sk: { S: "META" } },
      }),
    );

    const stored = result.Item?.record?.B;
    if (!stored) return null;

    return decodeRecord(stored);
  }
}
