import Anthropic from "@anthropic-ai/sdk";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  AnalyzerOutput,
  Diagnosis,
  FormInput,
  QUESTION_KEYS,
  type Grade,
  type OverallBand,
  type OverallScore,
  type QuestionKey,
} from "../src/lib/schema.js";
import {
  VOICE_ANCHORS,
  WORLDVIEW_PROMPT,
  buildComparablesBlock,
  buildDiagnosePrompt,
  buildGraderSystemPrompt,
  buildGraderUserMessage,
  buildSourcesBlock,
  buildYcCohortBlock,
} from "../src/lib/prompts.js";
import {
  dedupeChunks,
  retrieveComparables,
  retrieveForSection,
  retrieveYcCohort,
  type Chunk,
} from "../src/lib/retrieval.js";

const MODEL = "claude-sonnet-4-6";
const PHASE1_MAX_TOKENS = 1024;
// 4096 was hitting truncation: the model wrote 6 question analyses + headline
// + comparables and ran out of budget before the final prescribed_reading
// field, causing schema validation to fail on missing required fields.
// Sonnet 4.6 supports far higher; 8192 leaves comfortable headroom.
const PHASE2_MAX_TOKENS = 8192;

const ANALYZER_TOOL = {
  name: "submit_analysis",
  description:
    "Submit the structured YC-Brain analysis. Output MUST follow this schema exactly. Every quote field must appear verbatim in the SOURCES block. Comparables must come from the COMPARABLES block.",
  input_schema: z.toJSONSchema(AnalyzerOutput) as Record<string, unknown>,
};

const anthropic = new Anthropic();

// Score band ranges, must match the rubric in prompts.ts (rule 5a).
const SCORE_BAND: Record<Grade, [number, number]> = {
  red: [0, 39],
  yellow: [40, 69],
  green: [70, 100],
};

function findScoreBandViolations(
  output: ReturnType<typeof AnalyzerOutput.parse>,
): string[] {
  const violations: string[] = [];
  for (const key of QUESTION_KEYS) {
    const { grade, score } = output.questions[key];
    if (grade === null) {
      if (score !== null) {
        violations.push(`${key}: grade is null but score is ${score} — must also be null`);
      }
      continue;
    }
    if (score === null) {
      violations.push(`${key}: grade is ${grade} but score is null — must be in ${SCORE_BAND[grade].join("–")}`);
      continue;
    }
    const [lo, hi] = SCORE_BAND[grade];
    if (score < lo || score > hi) {
      violations.push(`${key}: score ${score} outside ${grade} band ${lo}–${hi}`);
    }
  }
  return violations;
}

function computeOverall(
  output: ReturnType<typeof AnalyzerOutput.parse>,
): OverallScore {
  const breakdown: Record<string, number> = {};
  const scores: number[] = [];
  for (const key of QUESTION_KEYS) {
    const s = output.questions[key].score;
    // Treat null (ungraded) as 0 — the founder gets no credit for a
    // question the grader couldn't assess. The rubric forces a grade
    // in normal flow, so this is a defensive default.
    const value = s ?? 0;
    breakdown[key] = value;
    scores.push(value);
  }
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  let band: OverallBand;
  if (avg >= 75) band = "strong";
  else if (avg >= 55) band = "promising";
  else if (avg >= 35) band = "shaky";
  else band = "weak";
  return { score: avg, band, breakdown };
}

// Normalize text for the verbatim check. The corpus contains YouTube
// auto-transcripts (e.g. Thiel's "Competition is for Losers") with
// filler words ("uh", "um") and stuttered repeats like "they're often
// they're often very hard to". A clean model quote will drop these,
// so we strip them on both sides before substring matching. This is
// not paraphrase tolerance — it only collapses ASR noise. Substantive
// rewording still fails the check.
function normalizeForQuoteCheck(s: string): string {
  let n = s
    .toLowerCase()
    // Strip markdown italic/bold markers BEFORE the word-char regex below.
    // Underscore is in \w, so without this the source's "_never_" stays as
    // "_never_" while the model's clean "never" doesn't match.
    .replace(/[_*`~]/g, " ")
    .replace(/\b(uh+|um+|er+|hmm+)\b/gi, " ")
    .replace(/[^\w\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Collapse immediately-repeated 1–5-word sequences to handle ASR
  // stutters: "they re often they re often very" → "they re often very".
  // Iterate until stable so cascading repeats also collapse.
  let prev = "";
  while (prev !== n) {
    prev = n;
    n = n.replace(/\b(\w+(?:\s+\w+){0,4})\s+\1\b/g, "$1");
  }
  return n;
}

function findVerbatimViolations(
  output: ReturnType<typeof AnalyzerOutput.parse>,
  chunks: Chunk[],
): string[] {
  // VOICE_ANCHORS are real PG passages quoted in the system prompt for tone
  // calibration. The model can legitimately cite them; without including
  // them in the haystack, valid citations fail this check whenever the
  // corresponding chunk wasn't retrieved for that question.
  const haystack = [
    ...chunks.map((c) => c.text),
    VOICE_ANCHORS,
  ].map(normalizeForQuoteCheck);
  const violations: string[] = [];
  for (const key of QUESTION_KEYS) {
    const q = output.questions[key].quote;
    if (!q) continue;
    const qNorm = normalizeForQuoteCheck(q);
    const found = haystack.some((t) => t.includes(qNorm));
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
  let ycCohort: Awaited<ReturnType<typeof retrieveYcCohort>>;
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
    ycCohort = await retrieveYcCohort(
      form.one_liner,
      diagnosis.retrieval_tags,
      diagnosis.company_shape,
    );
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
    buildYcCohortBlock(ycCohort),
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

    const scoreViolations = findScoreBandViolations(validated.data);
    if (scoreViolations.length > 0) {
      lastError = `Per-question score is inconsistent with its grade band — fix scores so red is 0–39, yellow 40–69, green 70–100:\n${scoreViolations.join("\n")}`;
      console.warn("[analyze] score band check failed on attempt", attempt, scoreViolations);
      continue;
    }

    const overall = computeOverall(validated.data);

    res.status(200).json({
      output: { ...validated.data, overall },
      meta: {
        diagnosis,
        chunks_used: allChunks.length,
        sources: Array.from(new Set(allChunks.map((c) => c.source))),
        comparables_used: comparables.map((c) => c.id),
        yc_cohort: {
          query_terms: ycCohort.query_terms,
          mature_only: ycCohort.mature_only,
          stats: ycCohort.stats,
          representatives: ycCohort.representatives.map((r) => ({
            name: r.name,
            slug: r.slug,
            batch: r.batch,
            status: r.status,
            top_company: r.top_company,
            one_liner: r.one_liner,
            website: r.website,
          })),
        },
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
