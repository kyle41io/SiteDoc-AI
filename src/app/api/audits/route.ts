import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { AuditRecord } from "@/lib/audit-types";
import { readAuditRecord, saveAuditRecord } from "@/lib/audit-store";
import { runPlaywrightScan } from "@/lib/playwright-scanner";
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

  const url = typeof payload === "object" && payload !== null && "url" in payload
    ? String(payload.url)
    : "";

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
    summary: "Scanner is running.",
  };

  await saveAuditRecord(runningRecord);

  try {
    const completedRecord = await runPlaywrightScan({
      auditId,
      url: normalizedUrl,
      startedAt: createdAt,
    });

    await saveAuditRecord(completedRecord);

    return NextResponse.json(completedRecord);
  } catch (error) {
    const failedRecord: AuditRecord = {
      ...runningRecord,
      status: "failed",
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "The scan failed.",
      summary:
        "The scanner could not complete this audit. Check the URL, site availability, TLS configuration, and browser runtime logs.",
    };

    await saveAuditRecord(failedRecord);

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

  try {
    return NextResponse.json(await readAuditRecord(id));
  } catch {
    return jsonError("Audit not found.", 404);
  }
}
