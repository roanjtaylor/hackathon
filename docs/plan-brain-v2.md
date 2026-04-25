# Backend Brain v2 — Implementation Plan

> **This document supersedes the brain/analyzer sections of `docs/plan.md`.**
> The frontend, localStorage, tracker, and corpus-scraping decisions in `plan.md` still stand.
> If a new chat is rebuilding the backend brain, read this file end-to-end before touching code.

---

## Why we're rebuilding the brain

The v1 brain (current `api/analyze.ts`) works but is too generic. It runs single-pass retrieval over the founder's prose and produces five evenly-weighted graded sections. The output cites PG quotes, but the citations are *lexically near* the founder's words rather than *diagnostically apt*. It feels like a search-with-quotes engine, not a YC partner.

The brain we're building is different in kind. It encodes the **YC worldview** as the model's permanent operating mind, then applies that worldview to the founder's specific situation, then grounds the diagnosis with verbatim quotes from the canon and structured comparables from real YC companies. The model is the reasoner; the corpus is the authority. Founders submit their startup, the brain diagnoses what's actually true (not what they wish were true), grades it against a stage rubric, points to companies who faced the same situation, and prescribes specific next actions. Concise. Direct. PG-toned. No optimism the corpus doesn't support.

This is the brain that needs to ship for the hackathon.

---

## Locked decisions

| Area | Decision |
|---|---|
| **Form input** | Garry Tan's six office-hours questions, verbatim, plus `startup_name`, `one_liner`, `stage` |
| **Worldview source** | Paul Graham core only — distilled to operating principles, not retrieved quotes |
| **Voice anchors** | Verbatim PG essay paragraphs in-prompt as few-shot tone fixers |
| **Knowledge base** | Existing `embeddings.json` (PG + Startup School) + new hand-curated `companies.json` (10 records) |
| **Retrieval** | Canon: voyage embeddings + cosine + stage filter (existing). Comparables: structured tag/stage filter, no embedding (new). |
| **Architecture** | Two-phase: Phase 1 = diagnose (no retrieval). Phase 2 = retrieve + grade + write (verbatim quotes enforced). |
| **Memory** | localStorage only |
| **Stages supported** | `idea`, `pre_launch`, `launched`. Defer `revenue` and `growth`. |
| **Cut from v1** | Anti-pattern flagging as separate field, weekly diff form, signal-extraction Haiku call (Phase 1 absorbs it) |

---

## The six office-hours questions (verbatim, the form)

These come from Garry Tan's GStack `/office-hours` skill and are the entire input to the brain alongside `startup_name`, `one_liner`, `stage`.

1. **Demand reality.** What's the strongest evidence you have that someone actually wants this — not "is interested," not "signed up for a waitlist," but would be genuinely upset if it disappeared tomorrow?
2. **Status quo.** What are your users doing right now to solve this problem — even badly? What does that workaround cost them?
3. **Desperate specificity.** Name the actual human who needs this most. What's their title? What gets them promoted? What gets them fired? What keeps them up at night?
4. **Narrowest wedge.** What's the smallest possible version of this that someone would pay real money for — this week, not after you build the platform?
5. **Observation & surprise.** Have you actually sat down and watched someone use this without helping them? What did they do that surprised you?
6. **Future-fit.** If the world looks meaningfully different in 3 years — and it will — does your product become more essential or less?

Source: `https://raw.githubusercontent.com/garrytan/gstack/main/office-hours/SKILL.md`

---

## The worldview prompt (Phase 1, system prompt)

This is the brain's permanent operating mind. It goes at the top of every Phase 1 (diagnose) call. PG-doctrine, no hedging, encoded as principles the model applies — not quotes it retrieves.

```
You are a YC partner running office hours. You have read every Paul Graham
essay and watched every Startup School lecture. You think the way Paul
Graham thinks.

OPERATING PRINCIPLES — always on:
- A startup is a company designed to grow fast. If it's not growing,
  it's not a startup yet, it's a project.
- Default alive or default dead. At any moment, one of those is true.
  Compute it.
- Make something people want. If no one wants it, you don't have a
  startup. There is no clever way around this.
- Do things that don't scale. The unscalable phase ends when usage
  forces it to, not before. Founders who skip it never find demand.
- Talk to users. The number of conversations is the leading indicator
  of everything else.
- Narrow wedge beats broad platform. Always. Platforms come from
  surviving long enough to expand from a wedge that worked.
- Founders deceive themselves about traction. Vanity metrics are
  evidence the founder is hiding from the truth.
- Surface "yes" is cheap. Real demand is people who would scramble
  if the product disappeared tomorrow.
- Switching cost from a free incumbent (WhatsApp, email, spreadsheets)
  is the highest switching cost there is. Better-than-free isn't enough.
- Two-sided marketplaces die from supply leakage and cold-start, in
  that order.

YOUR TASK:
Read the founder's submission to six office-hours questions. Diagnose
what's actually true about their company — not what they wish were true.
Identify the load-bearing problem. Name the dominant failure mode. State
the one thing that matters this week.

You are not a coach. You do not encourage. You do not hedge. You say
what is true. Founders benefit from hard truths, not encouragement.

Output a JSON diagnosis. No prose outside the JSON.
```

Phase 1 returns the diagnosis JSON (schema below). No retrieval, no citations yet — just reasoning under the worldview.

---

## The diagnosis schema (Phase 1 output, locked)

```json
{
  "company_shape": "string — short structural description, e.g. 'two-sided local marketplace, B2B2C'",
  "stage_signals": ["string", "..."],
  "dominant_failure_mode": "string — the load-bearing risk in one phrase",
  "anti_patterns_suspected": ["string", "..."],
  "the_one_thing": "string — single sentence, the call this week",
  "retrieval_tags": ["string", "..."]
}
```

**Worked example using Squadova (the founder's own startup):**

```json
{
  "company_shape": "two-sided local marketplace, B2B2C, casual sport",
  "stage_signals": [
    "£0 MRR", "10 WAU", "5mo runway", "first paid Stripe payment",
    "0/4 cold pitchside activation"
  ],
  "dominant_failure_mode": "free-incumbent switching cost (WhatsApp groups)",
  "anti_patterns_suspected": [
    "warm-network bias masking real conversion",
    "supply-side density dependent on founder hustle, not product"
  ],
  "the_one_thing": "Decide beachhead by May 2: existing teams vs. solo+new groups, with a 5x5 A/B test on direct activation.",
  "retrieval_tags": [
    "marketplace", "two-sided", "switching-cost", "activation",
    "doing-things-that-dont-scale", "warm-network", "cold-start"
  ]
}
```

`retrieval_tags` is the bridge into Phase 2. `the_one_thing` becomes the report's headline.

---

## Voice anchors (Phase 2, in-prompt few-shot)

Three verbatim paragraphs from PG essays, pasted into the grader prompt as the tone target. The model writes in this voice or it gets rejected. Pick paragraphs that do *diagnostic* work — not motivational ones.

**Anchor 1 — from "Startup = Growth":**
> Use the paragraph that defines default alive vs. default dead and frames trajectory as the question.
> Source: `paulgraham.com/growth.html` (the "default alive" paragraph; locate during build).

**Anchor 2 — from "Do Things That Don't Scale":**
> Use the Airbnb cereal-boxes / Stripe-installed-it-for-them paragraph. Establishes the *founders do the unscalable* posture.
> Source: `paulgraham.com/ds.html` (the "Recruit users manually" paragraph).

**Anchor 3 — from "How to Get Startup Ideas":**
> Use the "made-up startup ideas" paragraph — the warning against ideas that sound plausible but no one actually wants. Establishes the *hard-truth-about-fake-demand* posture.
> Source: `paulgraham.com/startupideas.html` (the "made-up vs. organic" paragraph).

When implementing: open these essays in `content/pg-essays/`, copy the literal paragraphs into a constant in `src/lib/prompts.ts`, paste them in the grader prompt under a `VOICE EXAMPLES — write in this exact tone:` heading.

---

## Comparables corpus (`content/companies.json`, 10 records)

Hand-curated. Each record is a structured story of a real YC (or YC-relevant) company. Filtered by stage + tag overlap, NOT by embedding similarity. This is the "a similar company at your stage did X → Y outcome" feature.

Schema:

```ts
interface Company {
  id: string;              // slug, e.g. "airbnb-cereal-boxes"
  company: string;
  stage: "idea" | "pre_launch" | "launched";
  year: number;
  outcome: "success" | "failure";
  situation: string;       // what was true at this stage
  action: string;          // what the founders actually did
  result: string;          // what happened as a consequence
  lesson: string;          // one-line takeaway, PG-flavoured
  tags: string[];          // overlap with diagnosis.retrieval_tags
  source: string;          // essay/talk/article that documents it
  url: string;
}
```

**The 10 records to seed:**

| # | Company | Stage | Outcome | Tags |
|---|---|---|---|---|
| 1 | Airbnb (cereal boxes + Craigslist hack) | idea/pre_launch | success | doing-things-that-dont-scale, marketplace, supply-side, fundraising-bridge |
| 2 | Stripe (Collisons installed it personally) | idea | success | doing-things-that-dont-scale, narrow-wedge, founder-closeness |
| 3 | Doordash (Palo Alto Delivery) | pre_launch | success | doing-things-that-dont-scale, marketplace, manual-ops, demand-validation |
| 4 | Dropbox (explainer-video MVP) | idea | success | demand-validation, narrow-wedge, mvp |
| 5 | Reddit (hand-seeded with fake accounts) | pre_launch | success | cold-start, marketplace, supply-side, doing-things-that-dont-scale |
| 6 | Instacart (Apoorva delivered groceries himself) | pre_launch | success | doing-things-that-dont-scale, marketplace, founder-closeness |
| 7 | Brex (pivoted from VR to corporate cards) | idea | success | narrow-wedge, pivot, idea-validation |
| 8 | **Homejoy** (supply leakage) | launched | **failure** | marketplace, supply-side, switching-cost, retention |
| 9 | **Munchery** (scaled before PMF) | launched | **failure** | premature-scale, false-pmf, unit-economics |
| 10 | **Sprig** (ignored unit economics) | launched | **failure** | unit-economics, premature-scale, marketplace |

Note: records 8–10 are failures, deliberately included so the brain can show "this is the company that died from the pattern you're showing." Especially Homejoy — directly relevant to any founder building a marketplace where supply has no switching cost.

Curating each record: ~5–10 minutes per company, mostly drawn from PG essays, Startup School lectures, and well-known case studies. Total ~1.5 hours.

---

## The grader prompt (Phase 2, system prompt)

The grader is the second model call. It receives the diagnosis from Phase 1, the canon chunks retrieved using `retrieval_tags`, the comparables filtered by stage+tags, the stage rubric, and the voice anchors. It writes the final report.

```
You are the writer for the YC Brain. You receive a diagnosis from the
office-hours partner, plus YC source material (essays, lectures, real
company stories). Your job is to write the founder's report.

HARD RULES — non-negotiable:
1. Use ONLY the SOURCES block and the COMPARABLES block. No outside
   knowledge. No generic startup advice.
2. Every `quote` field MUST appear VERBATIM in one of the SOURCES.
   Character-for-character. If you cannot find a verbatim sentence
   that supports the analysis, set quote=null and write the analysis
   without one. Better no quote than a misleading one.
3. Apply the stage rubric strictly. Do not soften red into yellow
   because the founder is trying.
4. Voice: match the VOICE EXAMPLES below exactly. Short paragraphs.
   Direct. No hedging. Never use "consider", "you might want to",
   "it's worth noting".
5. Each next_action must be specific and time-boxed within 7 days.
   Bad: "validate market". Good: "Talk to 10 target users by Friday."
6. Comparables must be drawn from the COMPARABLES block. Do not invent
   company anecdotes.

Submit your output by calling the `submit_analysis` tool. No prose
outside the tool call.

VOICE EXAMPLES — write in this exact tone:
{three PG paragraphs from voice anchors}

STAGE RUBRIC — {stage}:
{stage-specific rubric for the six questions}

DIAGNOSIS (from the partner):
{Phase 1 JSON}

SOURCES (PG essays + Startup School):
{retrieved chunks, labeled with [n] SOURCE / URL / TOPICS}

COMPARABLES (real YC companies at your stage):
{filtered companies.json records, formatted}
```

The tool-use contract enforces structured output. The verbatim-quote check + 1 retry from existing `api/analyze.ts` stays unchanged.

---

## Final output schema (the report)

```ts
interface AnalyzerOutput {
  // The load-bearing call — one PG-style sentence, max ~25 words.
  // Comes from diagnosis.the_one_thing, refined by the grader.
  headline: string;

  // Per-question grading. Six entries, keyed q1..q6 to map to the
  // six office-hours questions in order.
  questions: {
    q1_demand_reality: QuestionGrade;
    q2_status_quo: QuestionGrade;
    q3_desperate_specificity: QuestionGrade;
    q4_narrowest_wedge: QuestionGrade;
    q5_observation_surprise: QuestionGrade;
    q6_future_fit: QuestionGrade;
  };

  // 2-3 most relevant companies from the comparables retrieval.
  // Each one cites a real story the founder can learn from.
  comparables: ComparableRef[];

  // 2-3 essays/lectures the founder should read this week.
  // Drawn from canon chunks; "why_for_you" is one sentence.
  prescribed_reading: PrescribedRead[];
}

interface QuestionGrade {
  grade: "green" | "yellow" | "red" | null;
  quote: string | null;            // verbatim from canon, or null
  source_title: string | null;
  source_url: string | null;
  analysis: string;                // 2-3 sentences, PG voice
  next_actions: NextAction[];      // 1-2 entries
}

interface NextAction {
  text: string;                    // specific, time-boxed
  deadline_days: number;           // 1-7
}

interface ComparableRef {
  company: string;
  stage: string;
  situation: string;
  action: string;
  result: string;
  lesson: string;
  url: string;
}

interface PrescribedRead {
  title: string;
  url: string;
  why_for_you: string;             // one sentence
}
```

This replaces the existing `AnalyzerOutput` in `src/lib/schema.ts`.

---

## Stage rubrics (for the grader)

Existing `RUBRIC` in `src/lib/prompts.ts` is keyed by `problem | customer | solution | traction | biggest_blocker`. Rewrite it keyed by the six office-hours questions. Cover only `idea`, `pre_launch`, `launched`.

Sketch (fill out in implementation):

| Question | Idea | Pre-launch | Launched |
|---|---|---|---|
| q1 demand_reality | green: 10+ user convos with verbatim "I'd pay" quotes; yellow: pain heard but not in their words; red: gut + trend articles | green: real users testing privately who'd be upset if it vanished; yellow: waitlist with no pulse; red: no one would notice the shutdown | green: retained users using unprompted; yellow: surface yes, no return; red: no one came back this week |
| q2 status_quo | green: founder can describe the workaround in detail and quantify cost; yellow: workaround named but cost is hand-wavy; red: "nothing exists" or no workaround identified | (similar, slightly stricter) | (must include actual switching-cost analysis from incumbent) |
| q3 desperate_specificity | green: one human, named, role + day-in-life; yellow: "developers" or "SMBs"; red: "everyone" | (same bar, plus 5 named day-one users) | (same bar, plus retained named users) |
| q4 narrowest_wedge | green: one painful job, smallest version describable in one sentence; yellow: scope creep or platform thinking; red: kitchen-sink feature list | green: shipping in days, manual workflows fine; yellow: feature creep; red: months without launch | green: wedge is monetised; yellow: wedge unclear; red: wedge expanded before PMF on it |
| q5 observation_surprise | green: founder watched users; quotes the surprise; yellow: heard about usage second-hand; red: no observation | (same, plus session recording or in-person) | (same, plus retention/churn surprises) |
| q6 future_fit | green: 3-year tailwind named with evidence; yellow: tailwind asserted, no evidence; red: 3-year reasoning is "AI will help" or trend-deck | (same) | (same) |

Refine after first real run on Squadova.

---

## Two-phase architecture (`api/analyze.ts` redesigned)

```
POST /api/analyze
       │
       ▼
┌────────────────────────────────────────┐
│ PHASE 1: DIAGNOSE                       │
│  - Input: form (6 answers + meta)       │
│  - Model: Sonnet 4.6                    │
│  - System: WORLDVIEW PROMPT             │
│  - Tools: none; respond with JSON only  │
│  - Output: Diagnosis schema             │
└────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│ RETRIEVE                                │
│  - Canon: for each of q1..q6, embed     │
│    "{question} {founder's answer}       │
│     {diagnosis.dominant_failure_mode}   │
│     {diagnosis.retrieval_tags joined}"  │
│    → top-4 chunks via voyage + cosine   │
│    → filter by stage; dedupe; ~20 total │
│  - Comparables: filter companies.json   │
│    by stage match + tag overlap with    │
│    diagnosis.retrieval_tags. Top 4.     │
└────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│ PHASE 2: GRADE + WRITE                  │
│  - Input: form + diagnosis + canon +    │
│    comparables + stage rubric +         │
│    voice anchors                        │
│  - Model: Sonnet 4.6                    │
│  - System: GRADER PROMPT                │
│  - Tools: submit_analysis (forced)      │
│  - Output: AnalyzerOutput               │
└────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│ VALIDATE                                │
│  - Zod schema check                     │
│  - Verbatim-quote check (existing)      │
│  - On failure: retry once with error    │
│    in system prompt (existing)          │
└────────────────────────────────────────┘
       │
       ▼
{ output: AnalyzerOutput, meta: {...} }
```

Phase 1 is the diagnostic reasoning step. Phase 2 is the grounded writing step. Retrieval sits between them and queries off the diagnosis, not the founder's prose.

---

## File-by-file changes

### `src/lib/schema.ts`
- Replace `FormInput.sections` (5 keys) with `FormInput.questions` (6 keys: `q1_demand_reality` through `q6_future_fit`).
- Replace `AnalyzerOutput` with the new shape above (`headline`, `questions`, `comparables`, `prescribed_reading`).
- Add `Diagnosis` Zod schema for the Phase 1 output.
- Add `Company` Zod schema for `companies.json` records.
- Update `SECTION_KEYS` → `QUESTION_KEYS` constant.
- Stage union: keep all five stage values for backward compatibility, but only `idea | pre_launch | launched` are supported in v1 prompts.

### `src/lib/prompts.ts`
- Add `WORLDVIEW_PROMPT` constant (the Phase 1 system prompt above).
- Add `VOICE_ANCHORS` constant — three verbatim PG paragraphs.
- Rewrite `RUBRIC` keyed by question instead of section. Three stages only.
- Add `buildDiagnosePrompt(form: FormInput): string` — assembles the Phase 1 user message.
- Rewrite `buildSystemPrompt` → `buildGraderSystemPrompt(stage, diagnosis): string`.
- Rewrite `buildUserMessage` → `buildGraderUserMessage(form, diagnosis, sourcesBlock, comparablesBlock): string`.
- Add `buildComparablesBlock(records: Company[]): string` (analogous to `buildSourcesBlock`).

### `src/lib/retrieval.ts`
- Keep `loadChunks`, `voyageEmbedQuery`, `retrieveForSection`, `dedupeChunks` unchanged.
- Add `loadCompanies(): Promise<Company[]>` — reads `content/companies.json`.
- Add `retrieveComparables(stage: Stage, tags: string[], k=4): Company[]` — filters by stage, scores by tag overlap, returns top-k. Pure JS, no embedding.

### `api/analyze.ts`
- Rewrite as two-phase. New structure:
  1. Parse and validate form.
  2. **Phase 1:** call Sonnet with `WORLDVIEW_PROMPT`, parse `Diagnosis`. On validation failure, return 502.
  3. **Retrieve:** parallel — `retrieveForSection` per question (using diagnosis.retrieval_tags + question text), then dedupe; `retrieveComparables(stage, diagnosis.retrieval_tags)`.
  4. **Phase 2:** call Sonnet with grader system + tool-use enforced. Existing `submit_analysis` tool, but `input_schema` is the new `AnalyzerOutput`.
  5. Run `findVerbatimViolations` (existing). Retry once on failure with error in system prompt (existing).
  6. Return `{ output, meta: { diagnosis, chunks_used, comparables_used, attempt } }`.

### `content/companies.json` (new file)
- Hand-write the 10 records described in the comparables corpus section.
- Each record fully fills the `Company` schema.

### `scripts/build-embeddings.ts`
- No changes needed unless adding new corpus material. Existing PG + Startup School coverage is enough for v1.

### Frontend (`src/Form.tsx`, `src/Report.tsx`)
- `Form.tsx`: replace 5 textareas with 6 textareas, label them with the office-hours questions. Keep `startup_name`, `one_liner`, `stage` unchanged.
- `Report.tsx`: render the new shape — headline at top, six question cards (collapse/expand), comparables strip, prescribed reading list, all next-actions aggregated at the bottom as a checklist. Use existing traffic-light + quote-card components where possible.

---

## Build order (target: ~10–12 hours, hackathon-shippable)

1. **Schema swap** (1 hr) — `src/lib/schema.ts`. Lock the data shape first; everything else flows from it.
2. **Worldview + voice prompts** (1 hr) — `src/lib/prompts.ts`. Paste the worldview prompt verbatim. Open the three PG essays under `content/pg-essays/`, find the exact paragraphs, paste as `VOICE_ANCHORS`.
3. **Comparables data** (2 hrs) — write `content/companies.json` with 10 records. Use PG essays + Startup School transcripts as primary sources for the prose.
4. **Comparables retriever** (30 min) — `retrieveComparables` in `src/lib/retrieval.ts`. Tag-overlap scoring is just a sum.
5. **Two-phase analyzer** (2 hrs) — rewrite `api/analyze.ts`. Phase 1 → retrieve → Phase 2 → validate. Keep the retry loop.
6. **Stage rubrics by question** (1 hr) — fill out the three stages × six questions table in `src/lib/prompts.ts`.
7. **Frontend form swap** (1 hr) — `src/Form.tsx` to 6 textareas with the office-hours questions as labels.
8. **Frontend report** (2 hrs) — `src/Report.tsx` to render the new shape. Headline + question cards + comparables + prescribed reading + aggregated next-actions checklist.
9. **Self-test on Squadova** (1 hr) — submit Squadova's real situation, read the output, sanity-check tone and citations. Adjust rubric / worldview prompt wording if the output feels off.

---

## What's NOT in v1 (deliberately deferred)

- **Anti-pattern flagging as a separate output field.** Lessons live inside `comparables[i].lesson` instead.
- **Weekly diff form.** localStorage retains submissions; just don't render the diff yet.
- **Revenue + Growth stage rubrics.** Three stages cover the hackathon demo population.
- **Signal-extraction Haiku call** as a separate step. Phase 1 (diagnose) absorbs this work in one Sonnet call.
- **Failure post-mortem corpus as embedded chunks.** Failures are in `companies.json` as structured records, not as scraped text.
- **Founder network, leaderboard, map, browse page, tutorial.** All listed in the original `plan.md` as deferred — they remain deferred.

---

## Acceptance criteria — "good enough for founders to use"

The brain ships when it can do all of these on a real founder submission:

1. **Diagnoses, doesn't just match.** Phase 1's `the_one_thing` names the *load-bearing* problem, not just the topic the founder talked about most. Test: submit Squadova; the diagnosis must mention the `0/4 cold activation` signal and the switching-cost-vs-WhatsApp question. Not just "marketplace" generically.
2. **Voice is PG, not chatbot.** No "consider", no "you might want to", no "it's worth noting", no encouragement. Three paragraphs of output read indistinguishably from a PG blog snippet in tone.
3. **Quotes are verbatim and apt.** Every non-null `quote` field appears character-for-character in the SOURCES block AND is load-bearing for the analysis (not just lexically near).
4. **Comparables are specific.** Every `comparables[i]` is a named YC-or-equivalent company at the same stage with a story the founder can learn from. No "Company X (similar)".
5. **Next actions are time-boxed and specific.** Every `next_actions[i].text` would pass the test "could the founder report 'done/not done' on Friday?". `deadline_days` is 1–7.
6. **Failure mode triggers a comparable.** If the diagnosis flags a known anti-pattern (supply leakage, premature scale, switching cost), at least one of the comparables is a failure that died from it.
7. **No fabrication.** Zero made-up statistics, zero invented YC partner attributions, zero invented company stories.

---

## Sources / references for the new chat

- **Garry's six questions (verbatim):** `https://raw.githubusercontent.com/garrytan/gstack/main/office-hours/SKILL.md`
- **GStack repo (MIT licensed):** `https://github.com/garrytan/gstack`
- **PG essay index:** `https://paulgraham.com/articles.html`
- **Existing brain code:** `api/analyze.ts`, `src/lib/prompts.ts`, `src/lib/retrieval.ts`, `src/lib/schema.ts`
- **Existing corpus:** `content/embeddings.json` (already built, PG + Startup School chunks with stage tags)
- **Original project plan (still valid for frontend/storage/tracker):** `docs/plan.md`
- **Test fixture for self-dogfooding:** Squadova submission used in this conversation — football marketplace in Belfast, launched stage, 10 WAU, £0 MRR, 5mo runway, 0/4 cold pitchside activation. Use it as the regression test for every prompt change.

---

## Guiding principles (when in doubt)

1. **The corpus is the authority. The model is the reasoner.** No source = no answer. The verbatim-quote contract is non-negotiable.
2. **Diagnose first, retrieve second, write third.** Never the other way around.
3. **Concise or it's not understood.** PG ethos. If a paragraph could be shorter, it should be.
4. **Useful to the founder Monday morning.** If you wouldn't open this report on your own startup, it's wrong.
5. **Hard truths over encouragement.** The brain's value is what no one else will tell the founder.
