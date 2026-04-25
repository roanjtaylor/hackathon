import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  AnalyzerOutput,
  FormInput,
  SECTION_KEYS,
  type SectionKey,
} from "../src/lib/schema.js";
import {
  buildSourcesBlock,
  buildSystemPrompt,
  buildUserMessage,
} from "../src/lib/prompts.js";
import {
  dedupeChunks,
  retrieveForSection,
  type Chunk,
} from "../src/lib/retrieval.js";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

const ANALYZER_TOOL = {
  name: "submit_analysis",
  description:
    "Submit the structured analysis of the founder's startup. Output MUST follow this schema exactly. Every quote must appear verbatim in the SOURCES block.",
  input_schema: z.toJSONSchema(AnalyzerOutput) as Record<string, unknown>,
};

const anthropic = new Anthropic();

function findVerbatimViolations(
  output: ReturnType<typeof AnalyzerOutput.parse>,
  chunks: Chunk[],
): string[] {
  const haystack = chunks.map((c) => c.text);
  const violations: string[] = [];
  for (const key of SECTION_KEYS) {
    const q = output[key].quote;
    if (!q) continue;
    const found = haystack.some((t) => t.includes(q));
    if (!found) {
      violations.push(`${key}: quote not found verbatim — "${q.slice(0, 80)}..."`);
    }
  }
  return violations;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const parsed = FormInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid form input", detail: parsed.error.flatten() });
    return;
  }
  const form = parsed.data;

  // Per-section retrieval (k=4 each), then dedupe across sections by chunk id.
  let allChunks: Chunk[];
  try {
    const sectionLists = await Promise.all(
      SECTION_KEYS.map((key: SectionKey) =>
        retrieveForSection(`${key}: ${form.sections[key]}`, form.stage, 4),
      ),
    );
    allChunks = dedupeChunks(sectionLists);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Retrieval failed", detail: msg });
    return;
  }

  if (allChunks.length === 0) {
    res.status(500).json({ error: "No chunks retrieved — corpus may not be loaded" });
    return;
  }

  const baseSystem = buildSystemPrompt(form.stage);
  const userMessage = buildUserMessage(form, buildSourcesBlock(allChunks));

  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const systemPrompt = lastError
      ? `${baseSystem}\n\nPREVIOUS ATTEMPT FAILED VALIDATION:\n${lastError}\n\nFix it. Every quote must appear VERBATIM in the SOURCES block. If you cannot find a verbatim sentence, set quote=null and source_*=null.`
      : baseSystem;

    let response;
    try {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools: [ANALYZER_TOOL as Anthropic.Messages.Tool],
        tool_choice: { type: "tool", name: "submit_analysis" },
        messages: [{ role: "user", content: userMessage }],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: "Anthropic API error", detail: msg });
      return;
    }

    const toolBlock = response.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolBlock) {
      lastError = "You did not call submit_analysis. Call the tool with the structured output.";
      continue;
    }

    const validated = AnalyzerOutput.safeParse(toolBlock.input);
    if (!validated.success) {
      lastError = `Output failed schema validation: ${JSON.stringify(validated.error.flatten())}`;
      continue;
    }

    const violations = findVerbatimViolations(validated.data, allChunks);
    if (violations.length > 0) {
      lastError = `Hallucinated quotes detected — quotes must appear VERBATIM in SOURCES:\n${violations.join("\n")}`;
      console.warn("[analyze] verbatim check failed on attempt", attempt, violations);
      continue;
    }

    res.status(200).json({
      output: validated.data,
      meta: {
        chunks_used: allChunks.length,
        sources: Array.from(new Set(allChunks.map((c) => c.source))),
        attempt,
      },
    });
    return;
  }

  res.status(502).json({
    error: "Analyzer failed after 2 attempts",
    detail: lastError,
  });
}
