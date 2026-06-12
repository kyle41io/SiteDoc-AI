import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { AuditRecord } from "@/lib/audit-types";
import { auditStore } from "@/lib/store";
import { runPlaywrightScan } from "@/lib/playwright-scanner";
import { generateAiReport } from "@/lib/ai";
import { auditStrings } from "@/lib/audit/audit-i18n";
import { isLocale } from "@/i18n/config";
import { validatePublicHttpUrl } from "@/lib/url-validation";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isAuditId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
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

  const auditId = randomUUID();
  const createdAt = new Date().toISOString();
  const runningRecord: AuditRecord = {
    id: auditId,
    url: normalizedUrl,
    status: "running",
    language,
    createdAt,
    screenshots: {},
    consoleErrors: [],
    failedRequests: [],
    issues: [],
    metrics: [],
    scores: {
      overall: 0,
      scanner: 0,
      console: 0,
      network: 0,
    },
    summary: strings.runningSummary,
  };

  await auditStore.save(runningRecord);

  try {
    const completedRecord = await runPlaywrightScan({
      auditId,
      url: normalizedUrl,
      startedAt: createdAt,
      language,
    });

    // Enrich with the AI remediation layer. `generateAiReport` is non-blocking
    // and never throws — it falls back to a deterministic report when AI is
    // unconfigured or fails — so the audit always completes.
    const enrichedRecord: AuditRecord = {
      ...completedRecord,
      ai: await generateAiReport(completedRecord),
    };

    await auditStore.save(enrichedRecord);

    return NextResponse.json(enrichedRecord);
  } catch (error) {
    const failedRecord: AuditRecord = {
      ...runningRecord,
      status: "failed",
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "The scan failed.",
      summary: strings.failedSummary,
    };

    await auditStore.save(failedRecord);

    return NextResponse.json(failedRecord, { status: 500 });
  }
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
