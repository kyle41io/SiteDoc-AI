import type { AuditRecord } from "@/lib/audit-types";
import type { AiStrings } from "@/lib/audit/audit-i18n";
import type { AiInput, AiIssueInput } from "./types";

/** Max issues included in the prompt — enough signal without bloating tokens. */
const MAX_PROMPT_ISSUES = 15;

const SEVERITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function severityRank(severity: string): number {
  return SEVERITY_RANK[severity] ?? 3;
}

/**
 * Reduce a full audit record to the serializable subset a remediation provider
 * reasons over: severity-sorted, capped issue list plus headline scores.
 */
export function buildAiInput(record: AuditRecord): AiInput {
  const sorted = [...record.issues].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  );

  const issues: AiIssueInput[] = sorted.slice(0, MAX_PROMPT_ISSUES).map((issue) => ({
    category: issue.category,
    severity: issue.severity,
    title: issue.title,
    fix: issue.fix,
  }));

  return {
    url: record.finalUrl ?? record.url,
    language: record.language ?? "en",
    overall: record.scores.overall,
    scores: record.scores,
    issues,
    totalIssueCount: record.issues.length,
    summary: record.summary,
  };
}

/**
 * System prompt: pins the persona, the output language, and the rule that the
 * model must ground its report in the supplied audit data (no invented issues).
 */
export function buildSystemPrompt(strings: AiStrings): string {
  return [
    "You are SiteDoc AI, a senior web QA engineer writing a remediation report",
    "for a development team from the results of an automated website audit.",
    "",
    `Write ALL user-facing text in ${strings.languageName}.`,
    "",
    "Ground every statement in the audit data provided by the user message.",
    "Do not invent issues, scores, or metrics that are not present in that data.",
    "Be concrete, specific, and prioritized: explain what to fix and why it",
    "matters, in the order a developer should tackle it. Prefer plain, direct",
    "language over marketing tone. Produce the report in the required",
    "structured format.",
  ].join("\n");
}

function scoreLine(label: string, value: number | undefined): string | null {
  return typeof value === "number" ? `- ${label}: ${value}/100` : null;
}

/**
 * User prompt: a readable serialization of the audit data. Pure and
 * deterministic so it is unit-testable and prompt-cache friendly.
 */
export function buildUserPrompt(input: AiInput): string {
  const scoreLines = [
    scoreLine("Overall", input.overall),
    scoreLine("Accessibility", input.scores.accessibility),
    scoreLine("SEO", input.scores.seo),
    scoreLine("Performance", input.scores.performance),
    scoreLine("Scanner", input.scores.scanner),
  ].filter((line): line is string => line !== null);

  const issueLines =
    input.issues.length === 0
      ? ["(no issues detected by the deterministic checks)"]
      : input.issues.map(
          (issue, index) =>
            `${index + 1}. [${issue.category} · ${issue.severity}] ${issue.title}\n   Suggested fix: ${issue.fix}`,
        );

  return [
    `Audited URL: ${input.url}`,
    `Deterministic summary: ${input.summary}`,
    "",
    "Scores:",
    ...scoreLines,
    "",
    `Issues found (${input.totalIssueCount} total, showing ${input.issues.length}):`,
    ...issueLines,
  ].join("\n");
}
