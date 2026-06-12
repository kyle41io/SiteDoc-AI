import type { AuditAiReport, AuditRecord } from "@/lib/audit-types";
import { auditStrings } from "@/lib/audit/audit-i18n";
import { claudeProvider } from "./claude";
import { openaiProvider } from "./openai";
import { fallbackProvider } from "./fallback";
import { buildAiInput } from "./prompt";
import type { AiProvider } from "./types";

export type { AiInput, AiIssueInput, AiProvider } from "./types";
export { buildAiInput } from "./prompt";
export { fallbackReport } from "./fallback";

/**
 * Pick the live provider by which API key is present. Anthropic is preferred
 * (the project default); OpenAI is used when only an OpenAI key is set. Returns
 * null when no key is configured, so the caller uses the deterministic fallback.
 */
function selectLiveProvider(): AiProvider | null {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return claudeProvider;
  if (process.env.OPENAI_API_KEY?.trim()) return openaiProvider;
  return null;
}

/** Whether any live AI provider is configured. */
export function isAiConfigured(): boolean {
  return selectLiveProvider() !== null;
}

/**
 * Produce a remediation report for a completed audit. This is the only entry
 * callers should use. It is non-blocking and never throws: if no live AI
 * provider is configured, or the selected one errors or times out, it returns
 * the deterministic fallback report instead. Report language matches the
 * audit's language.
 */
export async function generateAiReport(record: AuditRecord): Promise<AuditAiReport> {
  const strings = auditStrings(record.language).ai;
  const input = buildAiInput(record);

  const provider = selectLiveProvider();
  if (provider) {
    try {
      return await provider.generate(input, strings);
    } catch (error) {
      console.warn(
        "[ai] live remediation provider failed; using deterministic fallback:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return fallbackProvider.generate(input, strings);
}
