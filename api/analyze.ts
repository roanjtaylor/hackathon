import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  AnalyzerOutput,
  Diagnosis,
  FormInput,
  QUESTION_KEYS,
  type QuestionKey,
} from "../src/lib/schema.js";
import {
  WORLDVIEW_PROMPT,
  buildComparablesBlock,
  buildDiagnosePrompt,
  buildGraderSystemPrompt,
  buildGraderUserMessage,
  buildSourcesBlock,
} from "../src/lib/prompts.js";
import {
  dedupeChunks,
  retrieveComparables,
  retrieveForSection,
  type Chunk,
} from "../src/lib/retrieval.js";

const MODEL = "claude-sonnet-4-6";
const PHASE1_MAX_TOKENS = 1024;
const PHASE2_MAX_TOKENS = 4096;

const ANALYZER_TOOL = {
  name: "submit_analysis",
  description:
    "Submit the structured YC-Brain analysis. Output MUST follow this schema exactly. Every quote field must appear verbatim in the SOURCES block. Comparables must come from the COMPARABLES block.",
  input_schema: z.toJSONSchema(AnalyzerOutput) as Record<string, unknown>,
};

const anthropic = new Anthropic();

function findVerbatimViolations(
  output: ReturnType<typeof AnalyzerOutput.parse>,
  chunks: Chunk[],
): string[] {
  const haystack = chunks.map((c) => c.text);
  const violations: string[] = [];
  for (const key of QUESTION_KEYS) {
    const q = output.questions[key].quote;
    if (!q) continue;
    const found = haystack.some((t) => t.includes(q));
    if (!found) {
      violations.push(`${key}: quote not found verbatim — "${q.slice(0, 80)}…"`);
    }
  }
  return violations;
}

// Strip a markdown/code-fence wrapper around a JSON object, if present.
function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    // ```json\n...\n``` or ```\n...\n```
    const stripped = trimmed.replace(/^```(?:json)?\s*\n?/, "").replace(/```$/, "");
    return stripped.trim();
  }
  // First { to last } — defensive against any leading/trailing prose despite
  // the prompt forbidding it.
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
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

  // ---------- PHASE 1: DIAGNOSE ----------
  let diagnosis: Diagnosis;
  try {
    const phase1 = await anthropic.messages.create({
      model: MODEL,
      max_tokens: PHASE1_MAX_TOKENS,
      system: WORLDVIEW_PROMPT,
      messages: [{ role: "user", content: buildDiagnosePrompt(form) }],
    });

    const textBlock = phase1.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text",
    );
    if (!textBlock) {
      res.status(502).json({ error: "Phase 1 returned no text block" });
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(extractJsonText(textBlock.text));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({
        error: "Phase 1 output was not valid JSON",
        detail: msg,
        raw: textBlock.text.slice(0, 800),
      });
      return;
    }

    const validated = Diagnosis.safeParse(json);
    if (!validated.success) {
      res.status(502).json({
        error: "Phase 1 diagnosis failed schema validation",
        detail: validated.error.flatten(),
        raw: json,
      });
      return;
    }
    diagnosis = validated.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Phase 1 (diagnose) Anthropic call failed", detail: msg });
    return;
  }

  // ---------- RETRIEVE ----------
  let allChunks: Chunk[];
  let comparables: Awaited<ReturnType<typeof retrieveComparables>>;
  try {
    // Per-question canon retrieval: blend the question text, the founder's
    // answer, the dominant failure mode, and the diagnosis tags.
    const tagsBlob = diagnosis.retrieval_tags.join(" ");
    const sectionLists = await Promise.all(
      QUESTION_KEYS.map((key: QuestionKey) =>
        retrieveForSection(
          `${key}: ${form.questions[key]} | failure mode: ${diagnosis.dominant_failure_mode} | tags: ${tagsBlob}`,
          form.stage,
          4,
        ),
      ),
    );
    const merged = dedupeChunks(sectionLists);

    comparables = await retrieveComparables(form.stage, diagnosis.retrieval_tags, 4);
    allChunks = merged;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Retrieval failed", detail: msg });
    return;
  }

  if (allChunks.length === 0) {
    res.status(500).json({ error: "No chunks retrieved — corpus may not be loaded" });
    return;
  }

  // ---------- PHASE 2: GRADE + WRITE ----------
  const baseSystem = buildGraderSystemPrompt(form.stage, diagnosis);
  const userMessage = buildGraderUserMessage(
    form,
    diagnosis,
    buildSourcesBlock(allChunks),
    buildComparablesBlock(comparables),
  );

  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const systemPrompt = lastError
      ? `${baseSystem}\n\nPREVIOUS ATTEMPT FAILED VALIDATION:\n${lastError}\n\nFix it. Every quote must appear VERBATIM in the SOURCES block. If you cannot find a verbatim sentence, set quote=null and source_*=null.`
      : baseSystem;

    let response;
    try {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: PHASE2_MAX_TOKENS,
        system: systemPrompt,
        tools: [ANALYZER_TOOL as Anthropic.Messages.Tool],
        tool_choice: { type: "tool", name: "submit_analysis" },
        messages: [{ role: "user", content: userMessage }],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: "Phase 2 Anthropic API error", detail: msg });
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
        diagnosis,
        chunks_used: allChunks.length,
        sources: Array.from(new Set(allChunks.map((c) => c.source))),
        comparables_used: comparables.map((c) => c.id),
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
