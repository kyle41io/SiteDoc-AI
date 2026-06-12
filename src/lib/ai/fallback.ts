import type { AuditAiReport } from "@/lib/audit-types";
import type { AiStrings } from "@/lib/audit/audit-i18n";
import type { AiInput, AiProvider } from "./types";

/** Distinct values, preserving first-seen order, capped at `limit`. */
function uniqueCapped(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Build a deterministic remediation report from audit data and localized
 * templates — no model involved. Used when no API key is set, or when the live
 * provider errors or times out, so a report is always produced.
 */
export function fallbackReport(
  input: AiInput,
  strings: AiStrings,
  generatedAt: string,
): AuditAiReport {
  const hasIssues = input.totalIssueCount > 0;

  const executiveSummary = hasIssues
    ? strings.fallbackSummaryIssues(input.url, input.overall, input.totalIssueCount)
    : strings.fallbackSummaryClean(input.url, input.overall);

  // Top issues are already severity-sorted by buildAiInput.
  const topIssues = uniqueCapped(
    input.issues.map((issue) => issue.title),
    5,
  );

  const recommendations = hasIssues
    ? uniqueCapped(
        input.issues.map((issue) => issue.fix),
        5,
      )
    : [strings.fallbackNoIssues];

  return {
    source: "fallback",
    executiveSummary,
    topIssues,
    recommendations,
    generatedAt,
  };
}

export const fallbackProvider: AiProvider = {
  id: "fallback",
  generate(input, strings) {
    return Promise.resolve(fallbackReport(input, strings, new Date().toISOString()));
  },
};
