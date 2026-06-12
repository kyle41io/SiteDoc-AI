import type { AuditAiReport } from "@/lib/audit-types";

/** Keep only non-empty string entries from an unknown array-ish value. */
export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  );
}

/**
 * Validate a provider's structured payload into an AuditAiReport, or throw so
 * the caller falls back. Shared by every live provider (Claude, OpenAI, …) so
 * they all enforce the same shape and `source: "ai"` semantics.
 */
export function parseReportPayload(
  input: unknown,
  model: string,
  generatedAt: string,
): AuditAiReport {
  if (typeof input !== "object" || input === null) {
    throw new Error("AI report payload is not an object.");
  }
  const payload = input as Record<string, unknown>;
  const executiveSummary = payload.executiveSummary;
  if (typeof executiveSummary !== "string" || executiveSummary.trim() === "") {
    throw new Error("AI report is missing an executive summary.");
  }

  const uxSuggestions = asStringArray(payload.uxSuggestions);

  return {
    source: "ai",
    model,
    executiveSummary: executiveSummary.trim(),
    topIssues: asStringArray(payload.topIssues),
    recommendations: asStringArray(payload.recommendations),
    ...(uxSuggestions.length > 0 ? { uxSuggestions } : {}),
    generatedAt,
  };
}
