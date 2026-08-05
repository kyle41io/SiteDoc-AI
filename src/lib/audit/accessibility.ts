import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import type { AuditIssue, AuditSeverity } from "@/lib/audit-types";
import type { AxeImpactCounts } from "@/lib/audit/scoring";
import type { AuditStrings } from "@/lib/audit/audit-i18n";

export type AxeImpact = "critical" | "serious" | "moderate" | "minor";

export type AxeNode = {
  target: string[];
  failureSummary?: string;
  html?: string;
};

export type AxeViolation = {
  id: string;
  impact?: AxeImpact | null;
  help: string;
  description: string;
  helpUrl: string;
  nodes: AxeNode[];
};

/**
 * Directory holding the installed axe-core package. Overridable because the
 * Lambda container copies only that one package to `/var/task`, and relying on
 * `process.cwd()` there would be an accident rather than a contract.
 *
 * Read at call time, not at module load, so tests can vary it.
 */
export function axeDirectory(): string {
  return (
    process.env["SITEDOC_AXE_DIR"] ??
    path.join(process.cwd(), "node_modules", "axe-core")
  );
}

// App locale → axe-core locale file (only those axe-core ships; others stay English).
const AXE_LOCALE_FILE: Record<string, string> = {
  es: "es.json",
  zh: "zh_CN.json",
  ja: "ja.json",
};

async function loadAxeLocale(language: string | undefined): Promise<unknown> {
  const file = language ? AXE_LOCALE_FILE[language] : undefined;
  if (!file) return undefined;
  try {
    const raw = await readFile(
      path.join(axeDirectory(), "locales", file),
      "utf8",
    );
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

type AxeGlobal = {
  configure: (config: { locale: unknown }) => void;
  run: (
    context: Document,
    options: { resultTypes: string[] },
  ) => Promise<{ violations: AxeViolation[] }>;
};

/**
 * Inject axe-core into an already-loaded page and return its violations,
 * localized to the audit language where axe ships a locale. Returns `null` if
 * the accessibility scan could not run at all — the caller then omits the
 * accessibility category entirely rather than reporting a misleading perfect
 * score. An empty array means "ran cleanly, no violations".
 */
export async function runAxe(
  page: Page,
  language: string | undefined,
): Promise<AxeViolation[] | null> {
  try {
    await page.addScriptTag({ path: path.join(axeDirectory(), "axe.min.js") });
    const locale = await loadAxeLocale(language);
    const violations = await page.evaluate(async (loc) => {
      const axe = (window as unknown as { axe: AxeGlobal }).axe;
      if (loc) {
        axe.configure({ locale: loc });
      }
      const result = await axe.run(document, { resultTypes: ["violations"] });
      return result.violations;
    }, locale);
    return violations;
  } catch (error) {
    console.warn(
      "[sitedoc] accessibility scan failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

const IMPACT_RANK: Record<AxeImpact, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

const IMPACT_SEVERITY: Record<AxeImpact, AuditSeverity> = {
  critical: "High",
  serious: "High",
  moderate: "Medium",
  minor: "Low",
};

const MAX_A11Y_ISSUES = 25;

export function countAxeImpacts(violations: AxeViolation[]): AxeImpactCounts {
  const counts: AxeImpactCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const violation of violations) {
    const impact = violation.impact ?? "minor";
    if (impact in counts) {
      counts[impact as AxeImpact] += 1;
    }
  }
  return counts;
}

/** Map axe violations to categorized accessibility issues (most severe first). */
export function buildAccessibilityIssues(
  violations: AxeViolation[],
  s: AuditStrings,
): AuditIssue[] {
  return [...violations]
    .sort((a, b) => IMPACT_RANK[a.impact ?? "minor"] - IMPACT_RANK[b.impact ?? "minor"])
    .slice(0, MAX_A11Y_ISSUES)
    .map((violation) => {
      const impact = violation.impact ?? "minor";
      const node = violation.nodes[0];
      return {
        id: `a11y-${violation.id}`,
        category: "Accessibility",
        severity: IMPACT_SEVERITY[impact],
        title: violation.help,
        selector: node?.target?.join(" "),
        detail: `${violation.description} ${s.a11yAffected(violation.nodes.length)}`.trim(),
        fix: node?.failureSummary?.trim() || violation.help,
        helpUrl: violation.helpUrl,
        impact,
      };
    });
}
