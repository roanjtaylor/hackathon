# Testing — User Research, Eval, Demo Narrative

> Owner runbook. Pair with [`plan.md`](./plan.md) (source of truth), [`backend.md`](./backend.md) (your eval partner), [`frontend.md`](./frontend.md) (you watch users use it).

---

## Mission (one breath)

Find out whether the tool actually helps founders — by talking to real ones, watching them use it, and feeding what you learn back into the corpus, the rubric, and the demo. **You are not waiting for the tool.** Your most important work happens *before* it exists.

---

## What you own

- Pre-tool interviews — 3+ founders, in the first 4 hours, *before* the analyzer works
- Interview script + data capture (sheet)
- Recruitment of Sunday testers
- Live testing sessions (silent observer)
- Eval rubric — qualitative criteria for "is the output any good?"
- Corpus seed list (with Backend) — which essays go in the corpus
- Per-stage rubric draft (with Backend) — what 🟢/🟡/🔴 means in each section
- "Would PG say this?" judgment when iterating prompts with Backend
- Demo narrative + runbook + rehearsal

## What you don't own

- Code. You are not waiting on it; you are not writing it.

---

## Why this role matters

The tool is only as good as the corpus, the rubric, and the eval. All three are content + judgment work, not code. If you sit and wait for "your turn," the analyzer ends up generic and the demo feels like a GPT wrapper. The pre-tool founder interviews are also literally what the product preaches — talking to users — so you're modeling the behavior the tool wants to induce.

---

## Hour-by-hour

| When | Task | Done when |
|---|---|---|
| H0–1 | **Kickoff** with team. Hand Backend the seed corpus URLs (5 PG essays + 2 Startup School lectures). Co-decide first-pass `idea`-stage rubric. | Backend unblocked |
| H1–4 | **Pre-tool interviews.** Walk the hackathon. 3+ founders, 10 min each. Use the script below. Capture verbatim. | Sheet has 3+ rows |
| H4–6 | Refine rubric + corpus list with Backend, based on what real founders said is their actual blocker. Start manually cleaning Startup School transcripts (typos, speaker labels) — boring but high-leverage, doesn't need code. | Rubric v2 committed by Backend |
| H6–8 | **First live eval with Backend.** Sit next to them when `/api/analyze` first works end-to-end. Run it on Backend's real startup. Read each section out loud. Score every line against the eval rubric below. Iterate prompt with Backend. | 4/5 sections pass eval |
| H8–10 | **Recruit Sunday testers.** Loop back to your H1–4 contacts. Confirm 2–3 for 15-min slots Sunday morning. Prep printed test script. | 2–3 confirmed slots |
| H10–12 | **Live testing sessions.** Sit them at the laptop. Read script. Be silent. Capture every confused face, every quote, every "huh?" Three rough-edge candidates per session, ranked by severity. Relay to Backend (prompt fixes) and Frontend (UI fixes). | 2–3 sessions completed |
| H12–14 | **Demo prep.** Decide which startup to demo. Seed last week's tracker entry to show movement. Write demo runbook. Practice twice. | Demo runbook + 2 rehearsals |

---

## Pre-tool interview script (print this, take it with you)

> "Hey — we're building something for founders at the hackathon. Can I ask you 5 questions, takes ~10 min?"

1. **What's your startup, in one sentence?** (capture verbatim)
2. **What's your biggest blocker right now?** (capture verbatim — this is gold)
3. **When you're stuck, where do you go for advice?** (specific names, sites, books — push for specificity)
4. **Have you read PG essays? Which ones? Which one helped most?** (gauge YC literacy)
5. **If a tool gave you a graded analysis of your startup with PG quotes, what would make it useful vs useless to you?** (capture verbatim — this drives the rubric)
6. *Close:* **"Can I grab you for 15 min Sunday morning to test what we built?"** (warm lead)

**What you're listening for:**
- Real blockers → tells you which sections matter most
- "Where do you go" → if 3/3 say nowhere, the problem is real
- "What makes it useful" → goes straight into the rubric and demo pitch
- Verbatim quotes you can put on a slide

---

## Sunday-tester script (printed, ~15 min)

> "We're building an interactive YC Startup School. I'd love your honest reaction. I won't help you while you're using it — your confusion is the data."

1. "Here's the form. Fill it in for your startup. Talk out loud as you go." *(silent observation — note every hesitation)*
2. "Now hit Analyze. Read the output out loud."
3. "Tell me what you think — good and bad."
4. "Would the next-action commitments actually push you to do them?" *(yes / no / which one and why)*
5. "Would you come back next week to track progress? Why / why not?"
6. "Anything that confused or annoyed you?"

**What you're listening for:**
- Where they hesitate on the form → Frontend has microcopy work
- Whether the quotes feel relevant → Backend has retrieval work
- Whether the analysis sounds like PG or like a chatbot → Backend has prompt work
- Whether the commitments are concrete enough → Backend has prompt work
- "Would you come back next week" — yes is the only success answer

**Don't:** explain, defend, justify, or lead. Capture verbatim.

---

## Eval rubric — what "good output" looks like

Apply this to every section result during the H6 first-eval and after every Backend prompt change.

| Grade | Criteria |
|---|---|
| 🟢 Pass | Quote is verbatim from a real PG/YC source. Analysis sounds like PG (direct, concrete, no hedging, no "it depends"). Next actions are measurable, time-boxed within 7 days, and specific (named numbers, named people, named deliverables). |
| 🟡 Partial | Quote is real but mediocre fit (kind of relevant but not the *best* match). Analysis is generic ("focus on customers"). Actions vague ("validate market"). |
| 🔴 Fail | Quote is fabricated (not in the source), attributed to wrong person, or analysis sounds like ChatGPT ("there are several factors to consider"). |

**Hard-fail triggers — escalate to Backend immediately:**
- Any quote that doesn't appear verbatim in the cited source
- Attribution to a YC partner who doesn't appear in the corpus
- "I don't have enough information" hedging
- Bullet-point lists in the analysis (it's supposed to be 2-3 sentences in PG voice)

---

## Where to capture data

A single Google Sheet (or Notion page) — **not in the repo**. Suggested tabs:

1. **Pre-tool interviews** — `name | startup | blocker | where_they_go | reaction | sunday_yes_no | quote_for_demo`
2. **Eval log** — `timestamp | section | grade | quote | analysis | actions | pass_fail | notes_for_backend`
3. **Sunday testers** — `name | startup | confusion_points | quotes | would_return | severity_1to5`
4. **Demo prep** — runbook draft, slide quotes

Share read access with Backend and Frontend. They reference your sheet; you don't reference their code.

---

## Files you touch

- A shared sheet / Notion page (NOT in the repo)
- That's it. No code, no markdown commits.

You *suggest* changes to:
- `prompts.ts` and rubric → Backend commits
- form microcopy and report copy → Frontend commits
- `plan.md` deferred list → owner of any changed decision commits

---

## Merge points

| Hour | What |
|---|---|
| H0 | Kickoff — corpus seed, rubric draft |
| H4 | Hand interview findings to Backend (drives rubric refinement) |
| H6 | First eval with Backend — iterate prompt together |
| H10 | Outside testers begin — relay findings live |
| H12 | Demo freeze — runbook locked, rehearsal complete |

---

## Risks

- **Drifting into a passive role.** "I'll wait for the tool to be ready" is the failure mode. The pre-tool interviews are the hardest, highest-leverage thing you'll do this weekend. Start at H1.
- **Recruiting friends only.** Friends will lie to be nice. Find people who don't know your team. Wander into other rooms.
- **Letting Backend tune the prompt without you.** The "is this PG?" judgment is yours. If they iterate solo, output will drift toward "technically correct" instead of "feels like a YC partner."
- **Over-prepping the demo, under-prepping the testing.** A polished demo of a bad tool loses to a rough demo of a tool that obviously works. Spend more on testing.
- **Not capturing verbatim.** Memory lies. Type quotes as you hear them.
- **Capturing data only at the end.** You'll forget. Capture during, not after.

---

## Definition of done (hackathon MVP)

- [ ] 3+ pre-tool interview rows in the sheet, verbatim quotes captured
- [ ] First-pass per-stage rubric written (with Backend)
- [ ] First eval pass — 4/5 sections at 🟢 on Backend's startup
- [ ] 2–3 outside testers ran the tool live, findings logged
- [ ] Top 3 rough edges from outside testers fixed by Backend / Frontend
- [ ] Demo narrative written: which startup, which seeded last-week entry, what we say at each click
- [ ] Demo rehearsed twice, end-to-end, under time pressure
- [ ] One verbatim founder quote ready to drop into the demo opening ("I literally don't know where to look when I'm stuck")
