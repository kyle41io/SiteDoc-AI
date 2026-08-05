import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { AuditRecord } from "@/lib/audit-types";
import { auditStore } from "@/lib/store";
import { enqueueAudit, queuedAuditRecord, type AuditJob } from "@/lib/audit/job-queue";
import { isAuditId } from "@/lib/audit/id";
import { auditStrings } from "@/lib/audit/audit-i18n";
import { isLocale } from "@/i18n/config";
import { validatePublicHttpUrl } from "@/lib/url-validation";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const record = (payload ?? {}) as { url?: unknown; language?: unknown };
  const url = typeof record.url === "string" ? record.url : "";
  const language = isLocale(record.language) ? record.language : "en";
  const strings = auditStrings(language);

  let normalizedUrl: string;

  try {
    normalizedUrl = await validatePublicHttpUrl(url);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid URL.", 400);
  }

  const job: AuditJob = {
    auditId: randomUUID(),
    url: normalizedUrl,
    language,
    startedAt: new Date().toISOString(),
  };

  // Persist a `queued` record, then run the scan in the background and return
  // immediately. The client polls `GET ?id=` for progress. This keeps the
  // request fast and decouples the heavy Playwright/AI work from the response.
  const queued = queuedAuditRecord(job, strings);
  await auditStore.save(queued);
  await enqueueAudit(job);

  return NextResponse.json(queued, { status: 202 });
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return jsonError("Audit id is required.", 400);
  }

  if (!isAuditId(id)) {
    return jsonError("Audit id is invalid.", 400);
  }

  let record: AuditRecord | null;

  try {
    record = await auditStore.get(id);
  } catch {
    return jsonError("The audit record could not be read.", 500);
  }

  if (!record) {
    return jsonError("Audit not found.", 404);
  }

  return NextResponse.json(record);
}
