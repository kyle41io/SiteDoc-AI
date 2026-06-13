import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { AuditRecord } from "@/lib/audit-types";
import type { AuditStore } from "@/lib/store/types";

/**
 * SQLite-backed {@link AuditStore} — a zero-config durable option that survives
 * restarts. The full record is stored as JSON in a single table keyed by id;
 * `created_at` is denormalized for ordering. A drop-in for {@link LocalAuditStore}.
 */
export class SqliteAuditStore implements AuditStore {
  private readonly db: Database.Database;
  private readonly upsertStmt: Database.Statement;
  private readonly getStmt: Database.Statement;

  constructor(baseDir: string = process.cwd()) {
    const dataDir = path.join(baseDir, ".data");
    mkdirSync(dataDir, { recursive: true });

    this.db = new Database(path.join(dataDir, "sitedoc.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS audits (
         id TEXT PRIMARY KEY,
         created_at TEXT NOT NULL,
         data TEXT NOT NULL
       )`,
    );

    this.upsertStmt = this.db.prepare(
      `INSERT INTO audits (id, created_at, data) VALUES (@id, @createdAt, @data)
       ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at, data = excluded.data`,
    );
    this.getStmt = this.db.prepare(`SELECT data FROM audits WHERE id = ?`);
  }

  async save(record: AuditRecord): Promise<void> {
    this.upsertStmt.run({
      id: record.id,
      createdAt: record.createdAt,
      data: JSON.stringify(record),
    });
  }

  async get(id: string): Promise<AuditRecord | null> {
    const row = this.getStmt.get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as AuditRecord) : null;
  }
}
