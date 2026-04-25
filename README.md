# Belfast Founders

A YC-style startup analyzer for founders outside Silicon Valley. You describe your startup; it grades each section (Problem, Customer, Solution, Traction, Blocker) with a verbatim Paul Graham / YC Startup School quote, and returns 1–2 concrete commitments for the week.

The differentiator: **every grade is grounded in a verbatim YC source**. No source = no answer. RAG over ~30 PG essays + ~10 Startup School lectures.

Hackathon MVP. Locked stack: **React + Vite** frontend, **Vercel serverless** (`/api/analyze`), **Claude Sonnet 4.6** for analysis, **Voyage `voyage-3`** embeddings, **localStorage** persistence (Supabase-shaped for later migration).

## Repo layout

```
api/               Vercel serverless function — POST /api/analyze
src/lib/           Shared logic: retrieval, prompts, Zod schema
src/components/    (frontend — owned by frontend teammate)
scripts/           Scrapers, embeddings build, local dev server, eval harness
content/           Markdown corpus + embeddings.json (built once, committed)
docs/              Plan + per-role runbooks (read these first)
```

## Docs

Start here:

- [docs/plan.md](docs/plan.md) — vision, locked decisions, architecture, build order. The seed document.
- [docs/backend.md](docs/backend.md) — backend runbook (corpus, embeddings, `/api/analyze`, prompts, rubrics).
- [docs/frontend.md](docs/frontend.md) — frontend runbook (form, report, tracker, localStorage adapter, Vercel deploy).
- [docs/testing.md](docs/testing.md) — testing runbook (founder interviews, eval loop, tester sessions, demo narrative).

## Quick start

```bash
npm install
cp .env.example .env.local        # add ANTHROPIC_API_KEY and VOYAGE_API_KEY

npm run scrape:pg                 # fetch ~30 PG essays → content/pg-essays/*.md
npm run scrape:ss                 # fetch ~10 Startup School lectures
npm run build:embeddings          # chunk + embed → content/embeddings.json

npm run dev:api                   # local /api/analyze on http://localhost:3000
npm run test:analyze              # run analyzer against a sample payload
```

> **Local dev:** use `npm run dev:api`, not `vercel dev` — the dev server loads `.env.local` correctly via tsx.

## Architecture (one breath)

```
React (Vite)
    └─ POST /api/analyze
            ├─ load content/embeddings.json
            ├─ per section: filter by stage → top-k cosine → dedupe
            └─ Claude w/ structured-output schema
                    └─ { sections: { problem: { grade, quote, source_url, analysis, next_actions[] } ... } }
```

Full detail in [docs/plan.md](docs/plan.md).
