import OpenAI from "openai";
import type { AuditAiReport } from "@/lib/audit-types";
import type { AiStrings } from "@/lib/audit/audit-i18n";
import { parseReportPayload } from "./parse";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { AiInput, AiProvider } from "./types";

/** Structured-output capable default; override with SITEDOC_OPENAI_MODEL. */
const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * OpenAI Structured Outputs schema. Strict mode requires every property to be
 * listed in `required` and `additionalProperties: false`, so `uxSuggestions` is
 * a required (possibly empty) array — `parseReportPayload` drops it when empty.
 */
const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    executiveSummary: {
      type: "string",
      description:
        "A 2-4 sentence executive overview for a developer: the page's overall health and the most important thing to address.",
    },
    topIssues: {
      type: "array",
      items: { type: "string" },
      description: "The 3-6 highest-impact problems, each a short phrase grounded in the audit data.",
    },
    recommendations: {
      type: "array",
      items: { type: "string" },
      description: "3-6 concrete, prioritized remediation steps a developer can act on.",
    },
    uxSuggestions: {
      type: "array",
      items: { type: "string" },
      description: "0-4 optional UX or polish suggestions (may be empty).",
    },
  },
  required: ["executiveSummary", "topIssues", "recommendations", "uxSuggestions"],
} as const;

export const openaiProvider: AiProvider = {
  id: "ai",
  async generate(input: AiInput, strings: AiStrings): Promise<AuditAiReport> {
    const model = process.env.SITEDOC_OPENAI_MODEL?.trim() || DEFAULT_MODEL;

    // API key is read from OPENAI_API_KEY. Bound latency so a slow model never
    // blocks the audit for long; the caller falls back on any thrown error.
    const client = new OpenAI({ timeout: 30_000, maxRetries: 1 });

    const completion = await client.chat.completions.create({
      model,
      // Bound output for cost/latency parity with the Claude provider.
      // `max_completion_tokens` is the current field and works for reasoning
      // models too, unlike the deprecated `max_tokens`.
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: buildSystemPrompt(strings) },
        { role: "user", content: buildUserPrompt(input) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "remediation_report", strict: true, schema: REPORT_SCHEMA },
      },
    });

    const message = completion.choices[0]?.message;
    if (message?.refusal) {
      throw new Error(`AI provider refused: ${message.refusal}`);
    }
    const content = message?.content;
    if (!content) {
      throw new Error("AI provider returned an empty response.");
    }

    return parseReportPayload(JSON.parse(content), model, new Date().toISOString());
  },
};
