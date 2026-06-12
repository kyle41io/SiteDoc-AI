import Anthropic from "@anthropic-ai/sdk";
import type { AuditAiReport } from "@/lib/audit-types";
import type { AiStrings } from "@/lib/audit/audit-i18n";
import { parseReportPayload } from "./parse";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { AiInput, AiProvider } from "./types";

/** Default to the most capable Claude model; allow an env override for cost. */
const DEFAULT_MODEL = "claude-opus-4-8";

const TOOL_NAME = "submit_remediation_report";

/**
 * Forced-tool schema. Constraining the model to a tool call guarantees a
 * structured, parseable report instead of free-form prose we'd have to scrape.
 */
const REPORT_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit the structured website remediation report.",
  input_schema: {
    type: "object",
    properties: {
      executiveSummary: {
        type: "string",
        description:
          "A 2-4 sentence executive overview for a developer: the page's overall health and the most important thing to address.",
      },
      topIssues: {
        type: "array",
        items: { type: "string" },
        description:
          "The 3-6 highest-impact problems, each a short phrase grounded in the audit data.",
      },
      recommendations: {
        type: "array",
        items: { type: "string" },
        description:
          "3-6 concrete, prioritized remediation steps a developer can act on.",
      },
      uxSuggestions: {
        type: "array",
        items: { type: "string" },
        description:
          "0-4 optional UX or polish suggestions beyond the deterministic findings.",
      },
    },
    required: ["executiveSummary", "topIssues", "recommendations"],
  },
};

export const claudeProvider: AiProvider = {
  id: "ai",
  async generate(input: AiInput, strings: AiStrings): Promise<AuditAiReport> {
    const model = process.env.SITEDOC_AI_MODEL?.trim() || DEFAULT_MODEL;

    // API key is read from ANTHROPIC_API_KEY. Bound latency so a slow model
    // never blocks the audit response for long; the caller falls back on error.
    const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });

    const message = await client.messages.create({
      model,
      max_tokens: 2048,
      system: buildSystemPrompt(strings),
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error("AI provider did not return a tool call.");
    }

    return parseReportPayload(toolUse.input, model, new Date().toISOString());
  },
};
