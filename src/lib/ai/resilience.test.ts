import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditRecord } from "@/lib/audit-types";

// Mock both live providers so we can assert selection and the never-throws
// guarantee. `vi.hoisted` lets the mock factories (which are hoisted above these
// declarations) reference the shared spies safely.
const { claudeGenerate, openaiGenerate } = vi.hoisted(() => ({
  claudeGenerate: vi.fn(),
  openaiGenerate: vi.fn(),
}));
vi.mock("./claude", () => ({ claudeProvider: { id: "ai", generate: claudeGenerate } }));
vi.mock("./openai", () => ({ openaiProvider: { id: "ai", generate: openaiGenerate } }));

import { generateAiReport } from "./index";

function record(): AuditRecord {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    url: "https://example.com",
    status: "completed",
    language: "en",
    createdAt: "2026-06-12T00:00:00.000Z",
    screenshots: {},
    consoleErrors: [],
    failedRequests: [],
    issues: [],
    metrics: [],
    scores: { overall: 90, scanner: 100, console: 100, network: 100 },
    summary: "Loaded cleanly.",
  };
}

const aiReport = (model: string) => ({
  source: "ai" as const,
  model,
  executiveSummary: `from ${model}`,
  topIssues: [],
  recommendations: [],
  generatedAt: "2026-06-12T00:00:00.000Z",
});

describe("generateAiReport provider selection & resilience", () => {
  const origAnthropic = process.env.ANTHROPIC_API_KEY;
  const origOpenai = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    claudeGenerate.mockReset();
    openaiGenerate.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    if (origAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = origAnthropic;
    if (origOpenai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = origOpenai;
    vi.restoreAllMocks();
  });

  it("uses OpenAI when only OPENAI_API_KEY is set", async () => {
    process.env.OPENAI_API_KEY = "test-openai";
    openaiGenerate.mockResolvedValue(aiReport("gpt-4o-mini"));
    const report = await generateAiReport(record());
    expect(openaiGenerate).toHaveBeenCalledOnce();
    expect(claudeGenerate).not.toHaveBeenCalled();
    expect(report.model).toBe("gpt-4o-mini");
  });

  it("prefers Claude when an Anthropic key is present", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.OPENAI_API_KEY = "test-openai";
    claudeGenerate.mockResolvedValue(aiReport("claude-opus-4-8"));
    await generateAiReport(record());
    expect(claudeGenerate).toHaveBeenCalledOnce();
    expect(openaiGenerate).not.toHaveBeenCalled();
  });

  it("falls back deterministically (never throws) when the live provider rejects", async () => {
    process.env.OPENAI_API_KEY = "test-openai";
    openaiGenerate.mockRejectedValue(new Error("simulated provider outage"));
    const report = await generateAiReport(record());
    expect(report.source).toBe("fallback");
    expect(report.executiveSummary).toContain("90/100");
  });
});
