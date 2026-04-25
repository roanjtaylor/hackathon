# Belfast Founders — Plan

> Seed document. Everything in this project grows from here. If a decision contradicts this file, update this file in the same change.

---

## Vision (one breath)

**Interactive YC Startup School.** The education course and the weekly-update loop that YC batch companies live inside, made interactive and personalized — so founders get the *exact* YC content that applies to *their* startup, *this* week, instead of reading 200 essays hoping one fits.

---

## The problem

- YC Startup School and Paul Graham's essays are a goldmine, but you have to already know what you're looking for to find it.
- ~200+ PG essays. Which one applies to your blocker today?
- YC batch companies have a weekly update mechanic that forces progress and surfaces problems early. Outside YC, nobody has that loop.
- Founders outside Silicon Valley get no playbook, no accountability, no peers running the same loop.

## The solution

A web tool that:

1. **Analyzer** — takes structured input on your startup state (Problem, Customer, Solution, Traction, Blocker, Stage) and returns a traffic-light report: a verbatim YC/PG quote per section + 1–2 concrete commitments for the week.
2. **Weekly tracker** — last week vs this week, growth gradient on your primary metric, section grades over time, overdue commitments visible in red.
3. **Knowledge corpus** — ~30 PG essays + ~10 Startup School lectures, scraped to markdown, embedded once, retrieved per-question.
4. **(Deferred)** — founder network, leaderboard, map, events, hires.

---

## The differentiator: objective, grounded, not generic

Every grade and every piece of advice **cites a verbatim quote** from the YC corpus. This is **retrieval-augmented generation**, not raw prompting.

**Hard rule:** if no source supports a claim, the tool says *"no YC source covers this directly"*. It does **not** invent advice. This is what makes it feel like a YC partner instead of a sycophantic chatbot, and it's the reason a founder will trust the output.

---

## Locked decisions (don't re-open mid-build)

| Area | Choice |
|---|---|
| Frontend | React + Vite |
| Backend | Vercel serverless function (`/api/analyze`) |
| LLM | Claude API — Sonnet 4.6 for analyzer (fast, cheap, plenty smart for synthesis) |
| Embeddings | Voyage AI `voyage-3`, computed once at build, cached as JSON in repo |
| Persistence | localStorage v0; schema mirrors a future Supabase migration |
| Input | Structured form, section-by-section |
| Stage | Captured; filters retrieval and tunes rubric (`idea` / `pre_launch` / `launched` / `revenue` / `growth`) |
| Output | Traffic light per section + verbatim YC quote + 1–2 concrete commitments |
| Multi-startup | One per user for v0 (data model supports many) |
| Tutorial | Deferred for v0 |
| Corpus v0 | ~30 PG essays + ~10 Startup School lectures |
| Tracker accountability | Overdue commitments turn red + growth gradient chart + section grades over time |
| Demo target | "Watch us analyze our real startup live" with seeded last-week entry to show movement |

---

## Architecture

```
React (Vite) frontend
   │
   ├── /                → Form (structured input)
   ├── /report          → Latest analyzer output (traffic lights, quotes, commitments)
   ├── /tracker         → Weekly entry + growth chart + grade history + commitments
   └── /history         → Past analyzer runs
            │
            └─→ POST /api/analyze (Vercel serverless)
                    │
                    ├── load /content/embeddings.json
                    ├── per section: filter by stage → top-k cosine → dedupe
                    └── Claude API call w/ structured-output schema
                            │
                            └── returns { sections: { problem: {grade, quote, source_url, analysis, next_actions[]} ... } }

Corpus: /content/*.md
   ├── frontmatter: { source, author, url, topics[], stage[] }
   └── pre-chunked at headings → embeddings.json (computed once)

State: localStorage. JSON export/import button on every page so we don't lose data.
```

---

## Data model (localStorage; mirrors future Supabase tables)

```js
{
  startup: {
    id,
    name,
    stage,                    // 'idea' | 'pre_launch' | 'launched' | 'revenue' | 'growth'
    problem,                  // string
    customer,                 // string
    solution,                 // string
    traction: { users, revenue, growth_pct, primary_metric_name },
    blocker,                  // string — biggest blocker this week
    updated_at
  },
  weekly_entries: [
    {
      id, startup_id,
      week_of,                // ISO date Monday
      last_week,              // free text — what we did last week
      this_week,              // free text — what we're doing this week
      primary_metric_value,   // number
      created_at
    }
  ],
  commitments: [
    {
      id, startup_id, weekly_entry_id,
      text,                   // "Talk to 10 customers by Friday"
      due_date,
      done,                   // bool
      source_section          // 'problem' | 'customer' | 'solution' | 'traction' | 'blocker'
    }
  ],
  analysis_runs: [
    {
      id, startup_id, weekly_entry_id,
      grades: { problem: 'green'|'yellow'|'red', ... },
      raw_response,           // full Claude response for replay/debug
      created_at
    }
  ]
}
```

Every collection has `startup_id` so the Supabase migration is `INSERT INTO ... SELECT FROM localStorage_export.json`.

---

## Repo layout

```
/content
  /pg-essays/*.md            ← scraped from paulgraham.com
  /startup-school/*.md       ← cleaned YouTube transcripts
  embeddings.json            ← built once, committed to repo
/scripts
  scrape-pg.ts               ← fetch HTML → markdown w/ frontmatter
  scrape-startup-school.ts   ← youtube-transcript + cleanup
  build-embeddings.ts        ← chunk by heading, embed via Voyage, write JSON
/api
  analyze.ts                 ← Vercel serverless: retrieval + Claude call
/src
  /components
    Form.tsx                 ← structured input form
    Report.tsx               ← traffic-light report w/ quote cards
    TrafficLight.tsx
    QuoteCard.tsx            ← quote + source link
    Commitments.tsx          ← checkboxes + due dates + red-overdue
    Tracker.tsx              ← weekly entry form
    GrowthChart.tsx          ← recharts line chart on primary metric
    GradeHistory.tsx         ← per-section grade strip across weeks
  /lib
    storage.ts               ← localStorage adapter w/ Supabase-shaped API
    retrieval.ts             ← cosine similarity, stage filter, dedupe
    prompts.ts               ← analyzer system prompt + per-stage rubric blocks
    schema.ts                ← Zod schemas for analyzer JSON output
  /pages
    index.tsx                ← form
    report.tsx
    tracker.tsx
    history.tsx
plan.md                      ← this file
```

---

## Retrieval flow (inside `/api/analyze`)

1. Receive form payload `{ startup, weekly_entry }`.
2. For each of the 5 sections (Problem, Customer, Solution, Traction, Blocker), build a query string from the user's text + section name.
3. Filter `embeddings.json` chunks where `chunk.stage` matches user's stage OR is `"all"`.
4. Top-k=4 by cosine similarity per section (~20 chunks total, deduped by source).
5. Call Claude with the structured-output schema (Zod-validated). Strict rule: every grade includes a verbatim quote from the provided chunks.
6. Return JSON. Client persists to `analysis_runs`, renders the report, materializes commitments.

---

## The analyzer system prompt (the part that makes this not generic)

```
You evaluate a founder's startup using ONLY the YC source material in the SOURCES block below.

Stage: {stage}
Rubric for this stage: {stage-specific rubric — e.g. for 'idea' stage, Customer is graded on
  number of real conversations, not retention. For 'revenue' stage, Customer is graded on
  retention/engagement.}

For each section (problem, customer, solution, traction, blocker) return:
- grade:        "green" | "yellow" | "red"
- quote:        a verbatim sentence from SOURCES that captures what YC would say
- source_url:   URL of the source the quote came from
- analysis:     2-3 sentences in PG's voice — direct, concrete, no hedging
- next_actions: 1-2 commitments. Each must be measurable and time-boxed within 7 days.

HARD RULES:
- Every quote must appear verbatim in SOURCES.
- If no source supports a section, return:
    grade=null, quote=null,
    analysis="No YC source covers this directly. Closest adjacent guidance: ..."
- Do not invent statistics. Do not attribute claims to YC partners not present in SOURCES.
- Next actions must be specific ("Talk to 10 customers by Friday"), never vague ("validate market").

SOURCES:
{retrieved chunks, each labeled with [source: filename, url: ...]}

USER STARTUP STATE:
{form contents}
```

Pair with `response_format: { type: "json_schema", schema: AnalyzerOutput }` to lock the shape.

---

## Build order (probable hackathon hours)

1. **Repo skeleton + scrape PG** (2–3 hrs) — Vite + React, `scripts/scrape-pg.ts`, ~30 essays land in `/content/pg-essays/*.md` with frontmatter.
2. **Startup School transcripts** (1–2 hrs) — pick 8–10 core lectures (How to Get Startup Ideas, How to Talk to Users, How to Plan an MVP, Default Alive, How to Set KPIs, etc.), pull transcripts, clean, frontmatter.
3. **Embeddings build script** (1 hr) — chunk by heading, Voyage API call, dump `embeddings.json`. Tag each chunk with `stage` and `topics`.
4. **Form UI + localStorage adapter** (2 hrs) — structured form, Zod-validated, persists on submit.
5. **`/api/analyze`** (2 hrs) — retrieval + Claude call + structured output + Zod validation.
6. **Report UI** (2 hrs) — traffic lights, quote cards with source links opening the full essay, commitment checkboxes that materialize into `commitments`.
7. **Tracker page** (2 hrs) — weekly entry form, growth-gradient chart (recharts), section-grade history strip, red-overdue commitments.
8. **Demo polish** (1–2 hrs) — seed last week's entry so the demo shows movement, fix rough edges, deploy to Vercel.

**Total: ~13–16 hours focused work.**

---

## Demo target

You sit down at the demo, fill in your real startup, hit Analyze. The report tells you something uncomfortable but true with PG's exact words. You set three commitments. You flip to the tracker and the audience sees last week's entry already there — including a green commitment ("did it"), a yellow one ("partial"), and a red overdue one ("didn't talk to enough users"). The growth gradient line is visible. The judges feel that this is what YC office hours are like.

---

## Deferred (post-hackathon, in rough priority order)

1. **Browse page** — markdown viewer with topic + stage filters. Cheap, high utility.
2. **Tutorial mode** — guided 8–10 lessons through Startup School canon, each lesson populates the analyzer.
3. **Supabase migration** — auth, multi-device, shared data model.
4. **Founder network** — directory, profiles, opt-in visibility on weekly updates.
5. **Leaderboard** — based on growth gradient + commitment-completion rate, not vanity metrics.
6. **Map** — pin founders by location.
7. **Events + hires** — community board.
8. **Multi-startup picker** — compare two ideas side-by-side under the same rubric.
9. **YC Library + RFS scraping** — extends corpus.
10. **Office Hours mode** — conversational follow-up on a graded report.

---

## Open questions (decide as they come up, don't block on them)

- Exact list of 30 PG essays — pick the canonical ones from the index, prioritize by recency-weighted citation in Startup School. ([paulgraham.com/articles.html](http://paulgraham.com/articles.html) is the index.)
- Exact list of 10 Startup School lectures — start from the "Curriculum" page on startupschool.org.
- Per-stage rubric wording — first-pass draft from PG's "Default Alive" + "Startup = Growth" + "Do Things That Don't Scale", refine after first real analyzer run on our own startups.
- Whether "Blocker" should be a separate section or fold into the others — try separate first, drop if it's noise.

---

## Guiding principles (when in doubt)

1. **Useful to us first.** If we wouldn't open it Monday morning to think about our own startup, we ship the wrong thing.
2. **Ground every claim.** No source = no answer. Sycophancy is the enemy.
3. **Force the work.** The point is to drive action, not produce a pretty report. Commitments + red-overdue + weekly cadence are the mechanic.
4. **Markdown over infrastructure.** Content lives as markdown in the repo. State lives as JSON in localStorage. We can hack on it on a plane.
5. **Network features come *after* the tool is good.** A leaderboard for a useless tool is a worse useless tool.
