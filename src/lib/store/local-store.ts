import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuditRecord } from "@/lib/audit-types";
import type { AuditStore } from "@/lib/store/types";

/**
 * Filesystem-backed {@link AuditStore}. Records are written as pretty-printed
 * JSON under `<baseDir>/.data/audits/<id>.json`. The `baseDir` is configurable
 * so tests can use a throwaway directory instead of the project root.
 */
export class LocalAuditStore implements AuditStore {
  private readonly dataDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.dataDir = path.join(baseDir, ".data", "audits");
  }

  private recordPath(id: string) {
    return path.join(this.dataDir, `${id}.json`);
  }

  async save(record: AuditRecord): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(
      this.recordPath(record.id),
      JSON.stringify(record, null, 2),
      "utf8",
    );
  }

  async get(id: string): Promise<AuditRecord | null> {
    try {
      const raw = await readFile(this.recordPath(id), "utf8");
      return JSON.parse(raw) as AuditRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }
}

// --- Local screenshot artifact helpers -------------------------------------
// Screenshots live under `.data/` (NOT `public/`): Next's production server only
// serves files that existed in `public/` at build time, so runtime-written
// screenshots there 404. Instead they are served by a route handler
// (`/api/artifacts/[id]/[file]`) that reads this directory. Keeping them in
// `.data/` also means they persist alongside the SQLite DB on the same volume.
// Object storage replaces these helpers at multi-instance scale.

const artifactRoot = path.join(process.cwd(), ".data", "audit-artifacts");

export function getAuditArtifactDirectory(auditId: string) {
  return path.join(artifactRoot, auditId);
}

export function getAuditArtifactUrl(auditId: string, filename: string) {
  return `/api/artifacts/${auditId}/${filename}`;
}
