import { describe, expect, it } from "vitest";
import { buildImprovementPrompt } from "@/lib/audit/improvement-prompt";
import { en } from "@/i18n/dictionaries/en";
import { vi } from "@/i18n/dictionaries/vi";
import type { AuditIssue, AuditRecord } from "@/lib/audit-types";

function issue(overrides: Partial<AuditIssue>): AuditIssue {
  return {
    id: "i1",
    category: "Accessibility",
    severity: "High",
    title: "Image is missing alt text",
    detail: "Screen readers cannot describe this image.",
    fix: "Add a descriptive alt attribute.",
    ...overrides,
  };
}

function record(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id: "abc123",
    url: "https://example.com",
    finalUrl: "https://example.com/",
    status: "completed",
    createdAt: "2026-07-22T00:00:00.000Z",
    screenshots: {},
    consoleErrors: [],
    failedRequests: [],
    issues: [],
    metrics: [],
    scores: { overall: 72, accessibility: 60, scanner: 90, console: 100, network: 100 },
    summary: "A summary.",
    ...overrides,
  };
}

describe("buildImprovementPrompt", () => {
  it("emits the role, target URL, and baseline scores", () => {
    const out = buildImprovementPrompt(record(), en);
    expect(out).toContain(`# ${en.aiPrompt.heading}`);
    expect(out).toContain(en.aiPrompt.role);
    expect(out).toContain("- URL: https://example.com/");
    expect(out).toContain("- Current overall health: 72/100");
    expect(out).toContain(`## ${en.aiPrompt.scoresHeading}`);
    expect(out).toContain(`- ${en.categories.Accessibility}: 60/100`);
    // Absent category scores are omitted.
    expect(out).not.toContain(`- ${en.categories.SEO}:`);
  });

  it("falls back to url when finalUrl is missing", () => {
    const out = buildImprovementPrompt(record({ finalUrl: undefined }), en);
    expect(out).toContain("- URL: https://example.com");
  });

  it("shows the no-issues message and no severity headings when clean", () => {
    const out = buildImprovementPrompt(record(), en);
    expect(out).toContain(en.aiPrompt.noIssues);
    expect(out).not.toContain(`### ${en.aiPrompt.severityHeading.High}`);
  });

  it("groups issues by severity in High→Medium→Low order with continuous numbering", () => {
    const out = buildImprovementPrompt(
      record({
        issues: [
          issue({ id: "low", severity: "Low", title: "Low issue" }),
          issue({ id: "high", severity: "High", title: "High issue" }),
          issue({ id: "med", severity: "Medium", title: "Medium issue" }),
        ],
      }),
      en,
    );
    expect(out).toContain("3 issues, highest impact first.");
    const highAt = out.indexOf(en.aiPrompt.severityHeading.High);
    const medAt = out.indexOf(en.aiPrompt.severityHeading.Medium);
    const lowAt = out.indexOf(en.aiPrompt.severityHeading.Low);
    expect(highAt).toBeGreaterThan(-1);
    expect(highAt).toBeLessThan(medAt);
    expect(medAt).toBeLessThan(lowAt);
    expect(out).toContain("1. [Accessibility] High issue");
    expect(out).toContain("2. [Accessibility] Medium issue");
    expect(out).toContain("3. [Accessibility] Low issue");
  });

  it("renders optional selector, reference, and code snippet for an issue", () => {
    const out = buildImprovementPrompt(
      record({
        issues: [
          issue({
            selector: "img.hero",
            helpUrl: "https://help.example/alt",
            codeSnippet: '<img src="x" alt="Team photo">',
          }),
        ],
      }),
      en,
    );
    expect(out).toContain(`- ${en.aiPrompt.elementLabel}: \`img.hero\``);
    expect(out).toContain(`- ${en.aiPrompt.fixLabel}: Add a descriptive alt attribute.`);
    expect(out).toContain(`- ${en.aiPrompt.referenceLabel}: https://help.example/alt`);
    expect(out).toContain("   ```");
    expect(out).toContain('   <img src="x" alt="Team photo">');
  });

  it("folds in AI recommendations and UX suggestions when present", () => {
    const out = buildImprovementPrompt(
      record({
        ai: {
          source: "ai",
          executiveSummary: "…",
          topIssues: [],
          recommendations: ["Compress hero image"],
          uxSuggestions: ["Increase tap target size"],
          generatedAt: "2026-07-22T00:00:00.000Z",
        },
      }),
      en,
    );
    expect(out).toContain(`## ${en.aiPrompt.aiHeading}`);
    expect(out).toContain("- Compress hero image");
    expect(out).toContain("- Increase tap target size");
  });

  it("omits the AI section when there are no AI points", () => {
    const out = buildImprovementPrompt(record(), en);
    expect(out).not.toContain(`## ${en.aiPrompt.aiHeading}`);
  });

  it("always ends with the proceed steps and deliverable, trimmed with a trailing newline", () => {
    const out = buildImprovementPrompt(record(), en);
    expect(out).toContain(`## ${en.aiPrompt.proceedHeading}`);
    expect(out).toContain(`1. ${en.aiPrompt.proceed[0]}`);
    expect(out).toContain(`## ${en.aiPrompt.deliverHeading}`);
    expect(out.endsWith(`${en.aiPrompt.deliver}\n`)).toBe(true);
  });

  it("localizes the scaffolding to the report's language", () => {
    const out = buildImprovementPrompt(record(), vi);
    expect(out).toContain(`# ${vi.aiPrompt.heading}`);
    expect(out).toContain(vi.aiPrompt.role);
    expect(out).toContain(`- ${vi.categories.Accessibility}: 60/100`);
  });

  it("singularizes the issue count line for a single issue", () => {
    const out = buildImprovementPrompt(record({ issues: [issue({})] }), en);
    expect(out).toContain("1 issue, highest impact first.");
  });
});
