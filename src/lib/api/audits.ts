import { randomUUID } from "node:crypto";
import type { AuditRecord } from "@/lib/audit-types";
import { auditStore } from "@/lib/store";
import { enqueueAudit, queuedAuditRecord, type AuditJob } from "@/lib/audit/job-queue";
import { isAuditId } from "@/lib/audit/id";
import { auditStrings } from "@/lib/audit/audit-i18n";
import { isLocale } from "@/i18n/config";
import { validatePublicHttpUrl } from "@/lib/url-validation";

/**
 * Transport-independent result: a status code and a body. Deliberately not a
 * `Response` — these functions are called from a Next route handler, a Lambda
 * Function URL handler and a local dev server, and only one of those three
 * speaks `Response`.
 */
export type ApiResult<T> = { status: number; body: T | { error: string } };

function fail(message: string, status: number): ApiResult<never> {
  return { status, body: { error: message } };
}

export async function createAudit(input: {
  url: unknown;
  language: unknown;
}): Promise<ApiResult<AuditRecord>> {
  const url = typeof input.url === "string" ? input.url : "";
  const language = isLocale(input.language) ? input.language : "en";
  const strings = auditStrings(language);

  let normalizedUrl: string;
  try {
    normalizedUrl = await validatePublicHttpUrl(url);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invalid URL.", 400);
  }

  const job: AuditJob = {
    auditId: randomUUID(),
    url: normalizedUrl,
    language,
    startedAt: new Date().toISOString(),
  };

  // Persist a `queued` record, then dispatch the scan and return immediately.
  // The client polls `getAudit` for progress. This keeps the request fast and
  // decouples the heavy Playwright/AI work from the response.
  const queued = queuedAuditRecord(job, strings);
  await auditStore.save(queued);
  await enqueueAudit(job);

  return { status: 202, body: queued };
}

export async function getAudit(id: string | null): Promise<ApiResult<AuditRecord>> {
  if (!id) return fail("Audit id is required.", 400);
  if (!isAuditId(id)) return fail("Audit id is invalid.", 400);

  let record: AuditRecord | null;
  try {
    record = await auditStore.get(id);
  } catch {
    return fail("The audit record could not be read.", 500);
  }

  if (!record) return fail("Audit not found.", 404);

  return { status: 200, body: record };
}
