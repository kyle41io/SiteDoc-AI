import type { AuditRecord, AuditSeverity } from "@/lib/audit-types";
import type { Dictionary } from "@/i18n/dictionaries";

/** Severity groups are emitted in this fixed, highest-impact-first order. */
const SEVERITY_ORDER: AuditSeverity[] = ["High", "Medium", "Low"];

/**
 * Turn a completed audit into a single, copy-and-paste brief for an AI coding
 * agent (Claude Code, Codex, Copilot, …).
 *
 * This is deliberately deterministic — a faithful, structured serialization of
 * the audit, not a second AI call. It always runs, needs no API key, and is
 * reproducible and unit-testable. The scaffolding is localized (`t.aiPrompt`);
 * the issue text comes from the record, already in the audit's language, so the
 * whole brief matches the report's language.
 *
 * The format is optimized for an agent to act on: a role, the measurable
 * baseline scores, issues grouped by severity with concrete fixes and
 * locations, any AI recommendations, and explicit success criteria.
 */
export function buildImprovementPrompt(record: AuditRecord, t: Dictionary): string {
  const p = t.aiPrompt;
  const url = record.finalUrl ?? record.url;
  const lines: string[] = [];

  lines.push(`# ${p.heading}`, "", p.role, "");

  // Target — what to work on and where the numbers start.
  lines.push(`## ${p.targetHeading}`);
  lines.push(`- ${p.urlLabel}: ${url}`);
  lines.push(`- ${p.overallLabel}: ${record.scores.overall}/100`, "");

  // Baseline scores — the measurable starting point for each category.
  const scoreEntries: Array<[string, number | undefined]> = [
    [t.categories.Accessibility, record.scores.accessibility],
    [t.categories.SEO, record.scores.seo],
    [t.categories.Performance, record.scores.performance],
    [t.categories.UX, record.scores.ux],
    [t.categories.BestPractices, record.scores.bestPractices],
    [t.categories.Scanner, record.scores.scanner],
    [t.categories.Console, record.scores.console],
    [t.categories.Network, record.scores.network],
  ];
  const presentScores = scoreEntries.filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );
  if (presentScores.length > 0) {
    lines.push(`## ${p.scoresHeading}`);
    for (const [label, value] of presentScores) lines.push(`- ${label}: ${value}/100`);
    lines.push("");
  }

  // Issues — grouped by severity, each with why/where/how and any snippet.
  lines.push(`## ${p.issuesHeading}`);
  if (record.issues.length === 0) {
    lines.push("", p.noIssues, "");
  } else {
    const count = record.issues.length;
    const line = (count === 1 ? p.issuesLine.one : p.issuesLine.other).replace(
      "{count}",
      String(count),
    );
    lines.push(`_${line}_`, "");
    let index = 0;
    for (const severity of SEVERITY_ORDER) {
      const group = record.issues.filter((issue) => issue.severity === severity);
      if (group.length === 0) continue;
      lines.push(`### ${p.severityHeading[severity]}`, "");
      for (const issue of group) {
        index += 1;
        lines.push(`${index}. [${t.categories[issue.category]}] ${issue.title}`);
        if (issue.detail) lines.push(`   - ${p.whyLabel}: ${issue.detail}`);
        if (issue.selector) lines.push(`   - ${p.elementLabel}: \`${issue.selector}\``);
        lines.push(`   - ${p.fixLabel}: ${issue.fix}`);
        if (issue.helpUrl) lines.push(`   - ${p.referenceLabel}: ${issue.helpUrl}`);
        if (issue.codeSnippet) {
          lines.push(
            "",
            "   ```",
            ...issue.codeSnippet.split("\n").map((line) => `   ${line}`),
            "   ```",
          );
        }
        lines.push("");
      }
    }
  }

  // Fold in the AI remediation layer's recommendations when present.
  const ai = record.ai;
  const aiPoints = [...(ai?.recommendations ?? []), ...(ai?.uxSuggestions ?? [])];
  if (aiPoints.length > 0) {
    lines.push(`## ${p.aiHeading}`);
    for (const point of aiPoints) lines.push(`- ${point}`);
    lines.push("");
  }

  // Success criteria and the requested output shape.
  lines.push(`## ${p.proceedHeading}`);
  p.proceed.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  lines.push("");
  lines.push(`## ${p.deliverHeading}`, "", p.deliver);

  return `${lines.join("\n").trim()}\n`;
}
