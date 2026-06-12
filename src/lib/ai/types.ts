import type { AuditAiReport, AuditScores } from "@/lib/audit-types";
import type { AiStrings } from "@/lib/audit/audit-i18n";

/** A single issue, reduced to the fields the remediation layer reasons over. */
export type AiIssueInput = {
  category: string;
  severity: string;
  title: string;
  fix: string;
};

/**
 * The audit data handed to a remediation provider. Deliberately a small,
 * serializable subset of `AuditRecord` so prompts stay deterministic and the
 * provider boundary is easy to test.
 */
export type AiInput = {
  url: string;
  /** BCP-47 short locale code (e.g. "en", "vi"). */
  language: string;
  overall: number;
  scores: AuditScores;
  /** Highest-impact issues, severity-sorted and capped for the prompt. */
  issues: AiIssueInput[];
  /** Total issue count before capping (the prompt may see fewer). */
  totalIssueCount: number;
  /** The deterministic scanner summary, for grounding. */
  summary: string;
};

/**
 * A remediation provider. The Claude provider calls the model; the fallback
 * provider builds a deterministic report. Callers go through `generateAiReport`
 * (see `index.ts`), which selects a provider and never throws.
 */
export interface AiProvider {
  readonly id: AuditAiReport["source"];
  generate(input: AiInput, strings: AiStrings): Promise<AuditAiReport>;
}
