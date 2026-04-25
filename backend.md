# Backend — Knowledge Base & Analyzer

> Owner runbook. Pair with [`plan.md`](./plan.md) (source of truth) and [`testing.md`](./testing.md) (your eval partner).

---

## Mission (one breath)

Build the YC knowledge corpus and the analyzer that grades a founder's startup using **only** that corpus, with verbatim quotes — no hallucination, no generic LLM output.

---

## What you own

- `/content/*` — scraped PG essays, Startup School transcripts, frontmatter, tags
- `/scripts/*` — scrape PG, scrape Startup School, build embeddings
- `/api/analyze.ts` — Vercel serverless function
- `/src/lib/prompts.ts` — analyzer system prompt + per-stage rubrics
- `/src/lib/retrieval.ts` — cosine similarity, stage filtering, dedupe
- `/src/lib/schema.ts` — **collaborative** with Frontend (you're co-authors)
- `embeddings.json` — committed to repo
- Pair with Tester on the eval loop ("does this sound like PG?")

## What you don't own

- React components, routing, styling
- localStorage adapter (Frontend)
- User interviews, recruitment, demo narrative (Tester)

---

## Locked decisions (from plan.md)

| Area | Choice |
|---|---|
| LLM | Claude API — `claude-sonnet-4-6` for analyzer (fast, cheap, smart enough for synthesis) |
| Embeddings | Voyage AI `voyage-3`, computed once at build, cached as JSON |
| Retrieval | Per-section, k=4, stage-filtered, deduped by source (~20 chunks total per analyze call) |
| Output | Zod-validated structured JSON: traffic light + verbatim quote + analysis + 1–2 commitments per section |
| Hard rule | Every quote must appear **verbatim** in retrieved chunks. Reject + retry if not. |

---

## Hour-by-hour

| When | Task | Done when |
|---|---|---|
| H0–1 | **Kickoff** with team. Lock Zod schema in `src/lib/schema.ts` together. Repo skeleton: Vite + React + TS, Vercel config, `.env.local` with `ANTHROPIC_API_KEY` + `VOYAGE_API_KEY`. | `pnpm dev` runs; schema committed |
| H1–3 | `scripts/scrape-pg.ts` — fetch HTML from paulgraham.com, convert to markdown, write to `/content/pg-essays/{slug}.md` with frontmatter. Run on Tester's seed list (5 essays). | 5 essays land as `.md` with frontmatter |
| H3–4 | `scripts/build-embeddings.ts` — chunk by heading (h2/h3), Voyage embed each chunk, write `/content/embeddings.json` with `{ id, source, url, topics, stage, text, vector }`. | `embeddings.json` exists with ~50 chunks |
| H4–6 | `/api/analyze.ts` — receive form payload, per-section retrieval, Claude call with system prompt + rubric + chunks, Zod-validate output. Verbatim-quote check before returning. | `curl` returns valid JSON for sample payload |
| **H6 — Merge point.** Frontend swaps mock for real `/api/analyze`. First testable MVP. ||
| H6–7 | **First eval with Tester.** Run it on your real startup. Iterate prompt against real outputs. | 4/5 sections pass Tester's "PG voice?" check |
| H7–10 | Expand corpus: scrape full ~30 PG essays + ~10 Startup School transcripts. Re-run embeddings. Tag stage + topics on each. | Full corpus indexed |
| H10–12 | Tune prompt based on outside-tester feedback (Tester relays it). | Top 3 rough edges fixed |
| H12–14 | Stability + polish. Cache analyzer responses by form-hash for demo (rate-limit safety). Logging. Deploy. | Live URL stable |

---

## Frontmatter shape (every markdown file in `/content/*`)

```yaml
---
source: "Do Things That Don't Scale"
author: "Paul Graham"
url: "http://paulgraham.com/ds.html"
topics: [growth, customer, sales, manual_work]
stage: [idea, pre_launch, launched]   # or [all]
---
```

`stage` and `topics` drive retrieval filtering. Hand-tag every file. Tester helps if you're unsure.

## Embedding chunk shape (`embeddings.json`)

```json
{
  "id": "ds-3",
  "source": "Do Things That Don't Scale",
  "url": "http://paulgraham.com/ds.html",
  "topics": ["growth", "customer"],
  "stage": ["idea", "pre_launch"],
  "text": "The most common unscalable thing founders have to do at the start...",
  "vector": [0.0123, -0.0456, ...]
}
```

---

## Retrieval logic (`src/lib/retrieval.ts`)

```ts
function retrieveForSection(
  sectionQuery: string,        // "Customer: We're targeting small B2B SaaS..."
  stage: Stage,
  embeddings: Chunk[],
  k = 4
): Chunk[] {
  const queryVec = await voyageEmbed(sectionQuery);
  return embeddings
    .filter(c => c.stage.includes(stage) || c.stage.includes('all'))
    .map(c => ({ ...c, score: cosine(queryVec, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// In /api/analyze: call once per section, then dedupe by `source`
```

---

## Analyzer system prompt (`src/lib/prompts.ts`)

Canonical version is in `plan.md` — copy it verbatim, don't rewrite from memory. Key invariants:

1. "ONLY the YC source material in the SOURCES block."
2. Every quote must appear verbatim in SOURCES.
3. If no source supports a section: `grade=null, quote=null, analysis="No YC source covers this directly..."`
4. Next actions must be measurable and time-boxed within 7 days.
5. Use `response_format: { type: "json_schema", schema: AnalyzerOutput }` so output shape is locked.

**Post-validation step you write:** after Claude returns, for each `quote`, run `chunks.some(c => c.text.includes(quote))`. If false → log it as a hallucination, retry once with a stricter reminder, fail loudly the second time. This is the difference between "feels like a YC partner" and "feels like ChatGPT."

---

## Per-stage rubric (in `prompts.ts`)

You write this with Tester. Template:

```ts
const RUBRIC: Record<Stage, Record<Section, RubricBand>> = {
  idea: {
    customer: {
      green: "10+ real conversations with target users, verbatim quotes captured.",
      yellow: "3–9 conversations, no captured quotes.",
      red: "0–2 conversations, mostly assumptions.",
    },
    traction: {
      green: "Not applicable at idea stage — focus on conversations, not metrics.",
      yellow: "Trying to measure too early.",
      red: "Vanity metrics already (signups, mailing list).",
    },
    // ...
  },
  pre_launch: { /* ... */ },
  launched: { /* ... */ },
  revenue: { /* ... */ },
  growth: { /* ... */ },
};
```

The rubric for the user's stage is injected into the system prompt at request time.

---

## Files you touch

```
/content/*
/scripts/*
/api/*
/src/lib/prompts.ts
/src/lib/retrieval.ts
/src/lib/schema.ts          ← collaborative with Frontend
/embeddings.json
.env.local
vercel.json (env binding)
```

## Files you don't touch

```
/src/components/*
/src/pages/*
/src/lib/storage.ts
```

---

## Merge points

| Hour | What |
|---|---|
| H0 | Kickoff — schema + seed corpus + output shape locked |
| H6 | First end-to-end. Frontend swaps mock. Tester runs first eval with you. |
| H10 | Second eval after outside testers — adjust prompt + rubric |
| H12 | Demo freeze — no more prompt changes |

---

## Risks

- **Hallucinated quotes.** Mitigate with verbatim post-validation (see above). Non-negotiable.
- **Schema drift mid-build.** If you change `schema.ts`, shout in chat first. Frontend has built against it.
- **Corpus bias.** If you only pick essays you like, the rubric is incomplete. Tester is your check on this.
- **Rate limits in demo.** Cache analyzer responses by form-payload hash. Pre-warm a demo run.
- **Cost surprise.** Negligible — Voyage embedding ~$0.02 once, Claude per-call ~$0.01. Sanity-check the dashboard.

---

## Definition of done (hackathon MVP)

- [ ] ~30 PG essays + ~10 Startup School lectures in `/content/*` with full frontmatter
- [ ] `embeddings.json` committed, ~200–400 chunks
- [ ] `/api/analyze` returns valid Zod-shaped JSON for any form payload
- [ ] Every quote in output is verifiable in retrieved chunks (no hallucinations)
- [ ] Per-stage rubric written for all 5 stages, all 5 sections
- [ ] Deployed to Vercel with env vars set
- [ ] Demo cached run prepared
