# Frontend — Design & Build

> Owner runbook. Pair with [`plan.md`](./plan.md) (source of truth) and [`backend.md`](./backend.md) (your API contract partner).

---

## Mission (one breath)

Build the React app — form, report, tracker, history — that makes the analyzer feel like talking to a YC partner. Calm, direct, no fluff.

---

## What you own

- `/src/components/*` — Form, Report, TrafficLight, QuoteCard, Commitments, Tracker, GrowthChart, GradeHistory
- `/src/pages/*` — `/`, `/report`, `/tracker`, `/history`
- `/src/lib/storage.ts` — localStorage adapter with Supabase-shaped API
- `/src/lib/schema.ts` — **collaborative** with Backend (you're co-authors)
- Routing, layout, styling
- Mock `/api/analyze` for development (so you don't block on Backend)
- Vercel deploy

## What you don't own

- The real `/api/analyze` (call its contract via Zod schema; Backend builds it)
- Corpus content, prompts, rubrics
- User testing, recruitment, demo narrative

---

## Locked decisions (from plan.md)

| Area | Choice |
|---|---|
| Framework | React + Vite + TypeScript |
| Styling | Tailwind (assumed — fast to ship; swap if team prefers) |
| Charts | recharts |
| Validation | Zod, both client and server |
| Persistence | localStorage. Schema mirrors a Supabase table model so migration is mechanical later. |
| Form | Structured: Problem, Customer, Solution, Traction (users / revenue / growth %), Blocker, Stage |
| Output rendering | Traffic light per section + verbatim YC quote + 1–2 commitments |

---

## Hour-by-hour

| When | Task | Done when |
|---|---|---|
| H0–1 | **Kickoff** with team. Lock Zod schema in `src/lib/schema.ts` together. Repo skeleton if not already. | Pages render with placeholders |
| H1–3 | `Form.tsx` — every field validated against schema. Stage dropdown. Persists to localStorage on submit. | Filling form persists; refresh shows it |
| H3–4 | `lib/storage.ts` — Supabase-shaped API (`getStartup`, `saveStartup`, `listWeeklyEntries`, etc.) backed by localStorage. **Mock `/api/analyze`** that returns canned JSON matching the Zod output schema, so you can build Report without waiting for Backend. | Mock analyzer returns a fixed report |
| H4–7 | `Report.tsx` — `TrafficLight`, `QuoteCard` (quote + source link, opens full essay URL in new tab), `Commitments` (checkbox + due date input + red text if `due_date < today && !done`). | Report renders end-to-end against mock |
| **H6 — Merge point.** Backend's real `/api/analyze` is live. Swap your mock. Tester does first eval. ||
| H7–10 | `Tracker.tsx` — weekly entry form (last week / this week / primary metric). `GrowthChart.tsx` (recharts line). `GradeHistory.tsx` — strip showing each section's grade across past weeks. | Real entry shows up next to seeded entry |
| H10–12 | `History.tsx` — list past `analysis_runs`, click to expand. Polish microcopy. Empty states. | Reads on Curator's tester run |
| H12–14 | Deploy to Vercel. Tighten styling. Make sure mobile layout doesn't break. Demo-readiness pass. | Live URL works on phone |

---

## Component specs (brief)

### `Form.tsx`
- Single page, single submit. Top-down: stage dropdown → Problem → Customer → Solution → Traction (3 inputs side-by-side) → Blocker → submit.
- Each field has a 1-line hint in muted text. Hints are taken from `plan.md` form mockup (e.g. "Who exactly? Have you talked to them?").
- On submit: save to localStorage as the current `startup`, POST to `/api/analyze`, navigate to `/report`.

### `Report.tsx`
- 5 cards top-to-bottom: Problem, Customer, Solution, Traction, Blocker.
- Each card has: header (section name + traffic light), `QuoteCard` (the quote + small source link), 2–3 line analysis, 1–2 `Commitment` rows.
- Sticky footer button: "Save commitments and go to tracker" → materializes commitments into localStorage and navigates.

### `TrafficLight.tsx`
- Circle: green/yellow/red, with label. If `grade === null`, show "—" with text "No YC source covers this directly."

### `QuoteCard.tsx`
- Italicized quote, em-dash, author, small "[source ↗]" link to URL. Don't truncate the quote.

### `Commitments.tsx`
- Each commitment: `[ ] text · due Friday · ⚠ overdue` (the ⚠/red only if past due and unchecked).
- Edit-in-place for text and date (founders will rewrite them).

### `Tracker.tsx`
- Top: this week's entry form (last week, this week, primary metric value).
- Middle: `GrowthChart` (one line, primary metric over weeks).
- Bottom: `GradeHistory` strip (5 rows, one per section, dots colored by grade across columns of weeks).
- Sidebar: open commitments grouped by week, red-overdue at top.

### `GrowthChart.tsx`
- recharts `LineChart` on `weekly_entries.primary_metric_value`. X-axis week_of, Y-axis metric value.

### `GradeHistory.tsx`
- 5 rows × N columns (one per past `analysis_run`). Each cell a colored dot. Hover shows the analysis text from that week.

---

## The contract with Backend (`src/lib/schema.ts`)

Co-author this in kickoff. Lock it. Don't change it without shouting.

```ts
import { z } from 'zod';

export const Stage = z.enum(['idea','pre_launch','launched','revenue','growth']);
export const Grade = z.enum(['green','yellow','red']).nullable();
export const Section = z.enum(['problem','customer','solution','traction','blocker']);

export const StartupForm = z.object({
  name: z.string(),
  stage: Stage,
  problem: z.string(),
  customer: z.string(),
  solution: z.string(),
  traction: z.object({
    users: z.number().nullable(),
    revenue: z.number().nullable(),
    growth_pct: z.number().nullable(),
    primary_metric_name: z.string(),
  }),
  blocker: z.string(),
});

export const Commitment = z.object({
  text: z.string(),
  due_date: z.string(),  // ISO
});

export const SectionResult = z.object({
  grade: Grade,
  quote: z.string().nullable(),
  source_url: z.string().url().nullable(),
  analysis: z.string(),
  next_actions: z.array(Commitment).max(2),
});

export const AnalyzerOutput = z.object({
  problem: SectionResult,
  customer: SectionResult,
  solution: SectionResult,
  traction: SectionResult,
  blocker: SectionResult,
});
```

Backend uses the same file server-side. Single source of truth.

---

## Mock for development (`src/lib/storage.ts`)

```ts
// Until Backend is live at H6, point the form's submit at this:
export async function mockAnalyze(form: StartupForm): Promise<AnalyzerOutput> {
  return AnalyzerOutput.parse({
    problem: { grade: 'green', quote: 'The way to get startup ideas is not to try to think of startup ideas.', source_url: 'http://paulgraham.com/startupideas.html', analysis: '...', next_actions: [...] },
    // ... canned for all 5 sections
  });
}
```

Switch via env flag: `VITE_USE_MOCK_API=1`.

---

## Files you touch

```
/src/components/*
/src/pages/*
/src/lib/storage.ts
/src/lib/schema.ts          ← collaborative with Backend
/src/index.css
/src/main.tsx
package.json
vite.config.ts
tailwind.config.ts
vercel.json (build settings)
```

## Files you don't touch

```
/api/*
/scripts/*
/content/*
/src/lib/prompts.ts
/src/lib/retrieval.ts
```

---

## Merge points

| Hour | What |
|---|---|
| H0 | Kickoff — schema locked with Backend |
| H6 | Real `/api/analyze` lands. Swap mock. End-to-end works. |
| H10 | Outside tester sessions begin (Tester runs them). You watch silently and list rough edges. |
| H12 | Demo freeze — only bug fixes after this |

---

## Risks

- **Building before schema is locked.** Don't. The 30 minutes in kickoff saves hours.
- **Overstyling.** Boring + clear beats fancy + broken. The product's value is the analyzer's words, not the chrome.
- **Adding deferred features.** No browse page, no leaderboard, no founder list. See `plan.md` deferred section. If tempted, look at the demo target instead.
- **Mobile demo at the booth.** Test on a phone before H12. A judge will pull out their phone.
- **Mock drift.** Keep the mock output schema-valid. If your Zod parse passes for the mock but fails for real Backend output, the contract is broken — bug in someone's schema usage.

---

## Definition of done (hackathon MVP)

- [ ] Form persists, validates, submits to (real) `/api/analyze`
- [ ] Report renders all 5 sections with traffic lights, quotes, commitments
- [ ] Commitments materialize to localStorage and show on tracker
- [ ] Tracker shows weekly entries, growth chart, grade history
- [ ] Overdue commitments turn red
- [ ] Deployed to Vercel
- [ ] Works on mobile (judges' phones)
- [ ] No console errors during a clean run-through
