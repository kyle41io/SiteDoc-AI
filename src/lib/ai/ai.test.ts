import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuditIssue, AuditRecord } from "@/lib/audit-types";
import { auditStrings } from "@/lib/audit/audit-i18n";
import { buildAiInput, buildUserPrompt } from "./prompt";
import { fallbackReport } from "./fallback";
import { parseReportPayload } from "./parse";
import { generateAiReport } from "./index";

function issue(partial: Partial<AuditIssue> & Pick<AuditIssue, "id" | "category" | "severity" | "title">): AuditIssue {
  return { detail: "", fix: `fix for ${partial.title}`, ...partial } as AuditIssue;
}

function record(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    url: "https://example.com",
    finalUrl: "https://example.com/",
    status: "completed",
    language: "en",
    createdAt: "2026-06-12T00:00:00.000Z",
    screenshots: {},
    consoleErrors: [],
    failedRequests: [],
    issues: [],
    metrics: [],
    scores: { overall: 88, accessibility: 92, seo: 69, performance: 100, scanner: 100, console: 100, network: 100 },
    summary: "The page loaded successfully.",
    ...overrides,
  };
}

const enAi = auditStrings("en").ai;

describe("buildAiInput", () => {
  it("sorts issues by severity and preserves the total count", () => {
    const input = buildAiInput(
      record({
        issues: [
          issue({ id: "1", category: "SEO", severity: "Low", title: "low" }),
          issue({ id: "2", category: "Accessibility", severity: "High", title: "high" }),
          issue({ id: "3", category: "Performance", severity: "Medium", title: "medium" }),
        ],
      }),
    );
    expect(input.issues.map((i) => i.severity)).toEqual(["High", "Medium", "Low"]);
    expect(input.totalIssueCount).toBe(3);
    expect(input.url).toBe("https://example.com/");
  });

  it("caps the prompt issue list at 15 while keeping the true total", () => {
    const many = Array.from({ length: 30 }, (_, n) =>
      issue({ id: String(n), category: "SEO", severity: "Low", title: `issue ${n}` }),
    );
    const input = buildAiInput(record({ issues: many }));
    expect(input.issues).toHaveLength(15);
    expect(input.totalIssueCount).toBe(30);
  });
});

describe("buildUserPrompt", () => {
  it("includes the URL, present scores, and issue fixes", () => {
    const input = buildAiInput(
      record({ issues: [issue({ id: "1", category: "SEO", severity: "High", title: "Missing title" })] }),
    );
    const prompt = buildUserPrompt(input);
    expect(prompt).toContain("https://example.com/");
    expect(prompt).toContain("Overall: 88/100");
    expect(prompt).toContain("Accessibility: 92/100");
    expect(prompt).toContain("Missing title");
    expect(prompt).toContain("Suggested fix: fix for Missing title");
  });
});

describe("fallbackReport", () => {
  it("summarizes a clean audit with a no-issues recommendation", () => {
    const input = buildAiInput(record({ issues: [] }));
    const report = fallbackReport(input, enAi, "2026-06-12T00:00:00.000Z");
    expect(report.source).toBe("fallback");
    expect(report.topIssues).toHaveLength(0);
    expect(report.recommendations).toEqual([enAi.fallbackNoIssues]);
    expect(report.executiveSummary).toContain("88/100");
  });

  it("lists top issues and deduplicated recommendations when issues exist", () => {
    const input = buildAiInput(
      record({
        issues: [
          issue({ id: "1", category: "SEO", severity: "High", title: "A", fix: "shared fix" }),
          issue({ id: "2", category: "SEO", severity: "Low", title: "B", fix: "shared fix" }),
        ],
      }),
    );
    const report = fallbackReport(input, enAi, "2026-06-12T00:00:00.000Z");
    expect(report.topIssues).toEqual(["A", "B"]);
    expect(report.recommendations).toEqual(["shared fix"]); // deduped
    expect(report.executiveSummary).toContain("2 issues");
  });

  it("localizes the summary to the audit language", () => {
    const input = buildAiInput(record({ language: "vi", issues: [] }));
    const viAi = auditStrings("vi").ai;
    const report = fallbackReport(input, viAi, "2026-06-12T00:00:00.000Z");
    expect(report.executiveSummary).toContain("đạt");
  });
});

describe("generateAiReport", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });

  it("returns the deterministic fallback when no API key is configured", async () => {
    const report = await generateAiReport(record({ issues: [] }));
    expect(report.source).toBe("fallback");
    expect(report.model).toBeUndefined();
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("parseReportPayload", () => {
  const at = "2026-06-12T00:00:00.000Z";

  it("maps a valid tool payload to an AI-sourced report", () => {
    const report = parseReportPayload(
      {
        executiveSummary: "  Looks solid overall.  ",
        topIssues: ["a", "", 3, "b"],
        recommendations: ["fix one"],
        uxSuggestions: ["polish the header"],
      },
      "claude-opus-4-8",
      at,
    );
    expect(report.source).toBe("ai");
    expect(report.model).toBe("claude-opus-4-8");
    expect(report.executiveSummary).toBe("Looks solid overall."); // trimmed
    expect(report.topIssues).toEqual(["a", "b"]); // empties/non-strings dropped
    expect(report.uxSuggestions).toEqual(["polish the header"]);
  });

  it("omits uxSuggestions when none are usable", () => {
    const report = parseReportPayload(
      { executiveSummary: "ok", topIssues: [], recommendations: [], uxSuggestions: [] },
      "m",
      at,
    );
    expect(report.uxSuggestions).toBeUndefined();
  });

  it("throws on a missing or empty executive summary (so the caller falls back)", () => {
    expect(() => parseReportPayload({ topIssues: [] }, "m", at)).toThrow();
    expect(() => parseReportPayload({ executiveSummary: "   " }, "m", at)).toThrow();
    expect(() => parseReportPayload(null, "m", at)).toThrow();
  });
});
