# Frontend Integration Tutorial (for Lovable)

This is a guide for the frontend partner. The backend "brain" is a single HTTP endpoint that takes a founder's answers to six questions and returns a structured YC-style analysis. Your job in Lovable is to build the form + report UI; this doc tells you exactly what to send and what you get back.

---

## 1. The contract — one endpoint

**`POST {API_BASE}/api/analyze`**

- Request: `Content-Type: application/json`, body = `FormInput` (below)
- Response: `200` with `{ output, meta }` — or a `4xx`/`5xx` with `{ error, detail? }`
- Latency: ~15–40s (two Claude calls + retrieval). Show a loading state.

There are no other routes. No auth headers. No streaming. Just one POST.

---

## 2. Hosting the backend

Lovable runs your frontend on its own domain; it cannot call `localhost`. You need the backend on a public URL. Two options:

### Option A — Deploy this repo to Vercel (recommended)

1. Push this repo to GitHub.
2. On vercel.com → **Add New Project** → import the repo.
3. Add environment variables in **Project → Settings → Environment Variables**:
   - `ANTHROPIC_API_KEY`
   - `VOYAGE_API_KEY`
4. Deploy. Vercel auto-detects `/api/analyze.ts` as a serverless function.
5. Your `API_BASE` is the deployment URL, e.g. `https://belfast-founders.vercel.app`.

### Option B — Expose local dev via a tunnel (for fast iteration)

```bash
npm run dev:api        # starts http://localhost:3000/api/analyze
npx ngrok http 3000    # gives you a public https URL
```

Use the ngrok URL as `API_BASE` in Lovable. Restart ngrok = new URL.

---

## 3. CORS

The serverless handler at `api/analyze.ts` does **not** currently set CORS headers. The local dev shim (`scripts/dev-server.ts`) does, but the deployed function does not. **Before you point Lovable at production, add CORS headers to `api/analyze.ts`** (or restrict to the Lovable preview domain). Minimal version, at the top of `handler`:

```ts
res.setHeader("Access-Control-Allow-Origin", "*"); // or the Lovable domain
res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");
if (req.method === "OPTIONS") { res.status(204).end(); return; }
```

---

## 4. Request shape — `FormInput`

```ts
{
  startup_name: string,        // 1–120 chars
  one_liner: string,           // 1–280 chars
  stage: "idea" | "pre_launch" | "launched", // (revenue/growth accepted but not yet supported)
  questions: {
    q1_demand_reality:        string, // 1–2000 chars each
    q2_status_quo:            string,
    q3_desperate_specificity: string,
    q4_narrowest_wedge:       string,
    q5_observation_surprise:  string,
    q6_future_fit:            string,
  }
}
```

The six questions, in the order they should appear in the form:

| Key | Prompt to show the founder |
|---|---|
| `q1_demand_reality`        | What evidence do you have that real people *want* this right now? Who, how many, how often? |
| `q2_status_quo`            | How are these people solving this problem today, and why is that solution insufficient? |
| `q3_desperate_specificity` | Describe the *one* type of customer who is most desperate for this — be specific (role, company size, situation). |
| `q4_narrowest_wedge`       | What is the smallest, most embarrassing version of the product you could ship this week to one user? |
| `q5_observation_surprise`  | What have you seen, while building or talking to users, that surprised you or contradicted your assumptions? |
| `q6_future_fit`            | If this works, what does the world look like in 5 years, and why are *you* the right person to build it? |

Adjust the wording to taste, but keep the keys exact — the backend matches on those.

---

## 5. Response shape — `AnalyzerOutput`

Successful response is `200`:

```ts
{
  output: {
    headline: string, // one-line overall verdict
    questions: {
      q1_demand_reality: QuestionGrade,
      q2_status_quo: QuestionGrade,
      q3_desperate_specificity: QuestionGrade,
      q4_narrowest_wedge: QuestionGrade,
      q5_observation_surprise: QuestionGrade,
      q6_future_fit: QuestionGrade,
    },
    comparables: ComparableRef[],          // 2–3 YC-ish company stories
    prescribed_reading: PrescribedRead[],  // 2–3 essays/talks
  },
  meta: {
    diagnosis: { /* phase-1 reasoning, useful for debug panels */ },
    chunks_used: number,
    sources: string[],
    comparables_used: string[],
    attempt: 1 | 2,
  }
}
```

Where:

```ts
QuestionGrade = {
  grade: "green" | "yellow" | "red" | null,
  quote: string | null,        // verbatim quote from a YC source
  source_title: string | null,
  source_url: string | null,   // link the quote
  analysis: string,            // 2–4 sentence critique
  next_actions: { text: string, deadline_days: 1..7 }[], // 1–2 items
}

ComparableRef = {
  company, stage, situation, action, result, lesson, url
}

PrescribedRead = {
  title, url, why_for_you
}
```

UI suggestions:

- Render `headline` as the page title.
- One card per question: colored border by `grade` (green/yellow/red, gray for null).
- Show `analysis`, then `next_actions` as a checklist with a "due in N days" pill.
- If `quote` is non-null, show it as a blockquote with `source_title` linking to `source_url`.
- "Comparables" section: 2–3 cards, each with company name → situation → action → result → lesson, link to `url`.
- "Prescribed reading" section: 2–3 link cards with `why_for_you` as the subtitle.

---

## 6. Error shape

Non-200 responses always look like:

```ts
{ error: string, detail?: unknown, raw?: unknown }
```

Common cases:

- `400 "Invalid form input"` — your payload didn't match `FormInput`. `detail` is a Zod flattened error; surface field-level messages to the user.
- `502 "Phase 1 ..."` / `"Phase 2 ..."` / `"Analyzer failed after 2 attempts"` — model/retrieval issue. Show a generic "We couldn't generate your report — try again" and a retry button.
- `500 "No chunks retrieved"` — corpus not loaded on the server (deploy issue). Page the backend dev.

---

## 7. Minimal Lovable client snippet

```ts
const API_BASE = "https://YOUR-VERCEL-DEPLOYMENT.vercel.app";

export async function analyze(form: FormInput) {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json as { output: AnalyzerOutput; meta: unknown };
}
```

In Lovable, store `API_BASE` as an environment variable / project setting so you can swap between ngrok (dev) and Vercel (prod) without code changes.

---

## 8. Testing without the UI

`scripts/test-analyze.ts` posts a sample `FormInput` against the running dev server. Run it to confirm the backend works before wiring up Lovable:

```bash
npm run dev:api          # terminal 1
npm run test:analyze     # terminal 2
```

If that returns a valid `output`, the contract above is real and Lovable can hit the same endpoint.

---

## 9. What you do NOT need to worry about

- Embeddings, retrieval, prompt construction — all server-side.
- The `companies.json` corpus — bundled with the deployment.
- Schema drift — the canonical Zod schemas live in `src/lib/schema.ts`. If the response shape ever changes, that file is the single source of truth; mirror the types in Lovable from there.
