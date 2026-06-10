import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuditRecord } from "@/lib/audit-types";

const dataDir = path.join(process.cwd(), ".data", "audits");
const artifactRoot = path.join(process.cwd(), "public", "audit-artifacts");

export async function ensureAuditStorage() {
  await mkdir(dataDir, { recursive: true });
  await mkdir(artifactRoot, { recursive: true });
}

export function getAuditArtifactDirectory(auditId: string) {
  return path.join(artifactRoot, auditId);
}

export function getAuditArtifactUrl(auditId: string, filename: string) {
  return `/audit-artifacts/${auditId}/${filename}`;
}

export async function saveAuditRecord(record: AuditRecord) {
  await ensureAuditStorage();
  await writeFile(
    path.join(dataDir, `${record.id}.json`),
    JSON.stringify(record, null, 2),
    "utf8",
  );
}

export async function readAuditRecord(auditId: string) {
  const raw = await readFile(path.join(dataDir, `${auditId}.json`), "utf8");
  return JSON.parse(raw) as AuditRecord;
}
