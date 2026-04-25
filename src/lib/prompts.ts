import type { Chunk } from "./retrieval.js";
import type {
  Company,
  Diagnosis,
  FormInput,
  QuestionKey,
  Stage,
} from "./schema.js";
import { QUESTION_KEYS } from "./schema.js";

// ---------------------------------------------------------------------------
// Phase 1 — the worldview prompt. PG-doctrine encoded as principles the model
// applies, not quotes it retrieves. This is the brain's permanent operating
// mind for the diagnose call.
// ---------------------------------------------------------------------------

export const WORLDVIEW_PROMPT = `You are a YC partner running office hours. You have read every Paul Graham
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

Output a JSON diagnosis. No prose outside the JSON. The JSON object must
have exactly these keys:
- company_shape: string. Short structural description, e.g.
  "two-sided local marketplace, B2B2C".
- stage_signals: array of short strings. Concrete metrics or facts the
  founder gave you (e.g. "£0 MRR", "10 WAU", "5mo runway").
- dominant_failure_mode: string. The single load-bearing risk in one
  phrase (e.g. "free-incumbent switching cost", "premature scale").
- anti_patterns_suspected: array of short strings. PG-named anti-patterns
  the submission shows (e.g. "warm-network bias", "vanity metric").
- the_one_thing: string. One sentence — the call this week.
- retrieval_tags: array of 4–8 short kebab-case tags. These will be used
  to retrieve canon chunks and comparables. Use tags from this canonical
  set when applicable: marketplace, two-sided, switching-cost, activation,
  doing-things-that-dont-scale, warm-network, cold-start, narrow-wedge,
  pivot, idea-validation, demand-validation, premature-scale, false-pmf,
  unit-economics, retention, supply-side, founder-closeness, manual-ops,
  fundraising-bridge, mvp.`;

// ---------------------------------------------------------------------------
// Voice anchors — three verbatim PG paragraphs pasted into the grader prompt
// as the tone target. The grader writes in this voice or it gets rejected.
// Sources:
//   - "Default Alive or Default Dead?"   paulgraham.com/aord.html
//   - "Do Things that Don't Scale"        paulgraham.com/ds.html
//   - "How to Get Startup Ideas"          paulgraham.com/startupideas.html
// ---------------------------------------------------------------------------

export const VOICE_ANCHORS = `[Anchor 1 — "Default Alive or Default Dead?" — diagnostic framing]
When I talk to a startup that's been operating for more than 8 or 9 months, the first thing I want to know is almost always the same. Assuming their expenses remain constant and their revenue growth is what it has been over the last several months, do they make it to profitability on the money they have left? Or to put it more dramatically, by default do they live or die?

The startling thing is how often the founders themselves don't know. Half the founders I talk to don't know whether they're default alive or default dead.

[Anchor 2 — "Do Things that Don't Scale" — founders do the unscalable]
Startups building things for other startups have a big pool of potential users in the other companies we've funded, and none took better advantage of it than Stripe. At YC we use the term "Collison installation" for the technique they invented. More diffident founders ask "Will you try our beta?" and if the answer is yes, they say "Great, we'll send you a link." But the Collison brothers weren't going to wait. When anyone agreed to try Stripe they'd say "Right then, give me your laptop" and set them up on the spot.

Airbnb is a classic example of this technique. Marketplaces are so hard to get rolling that you should expect to take heroic measures at first. In Airbnb's case, these consisted of going door to door in New York, recruiting new users and helping existing ones improve their listings.

[Anchor 3 — "How to Get Startup Ideas" — fake demand sounds plausible]
The danger of an idea like this is that when you run it by your friends with pets, they don't say "I would never use this." They say "Yeah, maybe I could see using something like that." Even when the startup launches, it will sound plausible to a lot of people. They don't want to use it themselves, at least not right now, but they could imagine other people wanting it. Sum that reaction across the entire population, and you have zero users.`;

// ---------------------------------------------------------------------------
// Stage rubrics, keyed by question. Three stages only (idea, pre_launch,
// launched). v1 deliberately ignores revenue/growth — covered by the form's
// stage union for backward compatibility but mapped to "launched" rubric.
// ---------------------------------------------------------------------------

interface RubricBand {
  green: string;
  yellow: string;
  red: string;
}

type SupportedStage = "idea" | "pre_launch" | "launched";
type StageRubric = Record<QuestionKey, RubricBand>;

export const RUBRIC: Record<SupportedStage, StageRubric> = {
  idea: {
    q1_demand_reality: {
      green: "10+ user conversations with verbatim 'I'd pay for this' or 'I'd be furious if it disappeared' quotes captured.",
      yellow: "Pain has been heard but not in users' own words; signal is interest rather than urgency.",
      red: "Evidence is gut, trend articles, or 'people would obviously want this'. No real conversations.",
    },
    q2_status_quo: {
      green: "Founder can describe the workaround in detail (tool, frequency, time spent) and quantify what it costs the user in money or hours.",
      yellow: "A workaround is named but the cost is hand-wavy — 'it's annoying' rather than '4 hours/week'.",
      red: "'Nothing exists' or no workaround identified — usually means the problem isn't acute enough to act on.",
    },
    q3_desperate_specificity: {
      green: "One named human, with title, what gets them promoted, what gets them fired, what keeps them up at night. Founder can describe their day.",
      yellow: "A role like 'developers' or 'SMB owners' — generic, no day-in-life detail.",
      red: "'Everyone' or 'anyone who…'. The founder hasn't picked a person yet.",
    },
    q4_narrowest_wedge: {
      green: "One painful job, smallest version describable in one sentence; could be sold for real money this week.",
      yellow: "Scope creep, platform thinking, 'eventually we'll do X and Y too'.",
      red: "Kitchen-sink feature list. Founder is building a platform before they've sold a single wedge.",
    },
    q5_observation_surprise: {
      green: "Founder has watched at least one user attempt the task without help and quotes the moment of surprise.",
      yellow: "Heard about usage second-hand or only seen friendly users.",
      red: "No observation. Founder cannot tell you what surprised them because they haven't watched.",
    },
    q6_future_fit: {
      green: "Specific 3-year tailwind named with concrete evidence (regulation, demographic shift, cost curve).",
      yellow: "Tailwind asserted but no evidence beyond 'AI will help' or 'people are getting more X'.",
      red: "Future framing is a trend deck or hand-wave. No reason this is more essential in 3 years than today.",
    },
  },

  pre_launch: {
    q1_demand_reality: {
      green: "Real users are testing privately and would be visibly upset if access were taken away. At least one named.",
      yellow: "Engaged waitlist with replies, but no one has used the product yet — desire is unverified.",
      red: "Waitlist with no pulse, or 'people will sign up when we launch'. No one would notice the shutdown.",
    },
    q2_status_quo: {
      green: "Founder has watched users perform the workaround and can describe specifically what part is broken and what it costs them.",
      yellow: "Workaround is described but second-hand; cost numbers are estimates not measurements.",
      red: "'They use spreadsheets' with no detail, or 'there's nothing like this' without checking.",
    },
    q3_desperate_specificity: {
      green: "Five named day-one users with role, company, what they're hiring the product to do.",
      yellow: "ICP narrowed to a segment but no individuals committed.",
      red: "Still building for 'developers' or 'SMBs' generically.",
    },
    q4_narrowest_wedge: {
      green: "Shipping in days; manual workflows are explicitly fine; founder will charge for the smallest possible version.",
      yellow: "Feature creep is delaying launch by weeks. Founder is polishing before any user has touched it.",
      red: "Months without launch. The wedge keeps growing because it's safer than shipping.",
    },
    q5_observation_surprise: {
      green: "Founder has run an unaided session — recorded or in person — and can name a specific surprise that changed their thinking.",
      yellow: "Heard about usage second-hand, no in-person observation.",
      red: "No one has used it without help. Or only friends/family, who don't count.",
    },
    q6_future_fit: {
      green: "3-year tailwind named with evidence; founder can articulate why the wedge expands as the world shifts.",
      yellow: "Tailwind asserted, no evidence; story is plausible but unsubstantiated.",
      red: "Future framing is 'AI is changing everything' or trend deck. No specific reason this becomes more essential.",
    },
  },

  launched: {
    q1_demand_reality: {
      green: "Users return unprompted and use the product without nudges. Founder can name people who'd be upset if it shut down tomorrow.",
      yellow: "Surface yes — signups, polite feedback — but no return visits and nothing the founder would call retention.",
      red: "No one came back this week. The product launched and nobody noticed.",
    },
    q2_status_quo: {
      green: "Founder has done explicit switching-cost analysis from the incumbent (often free: WhatsApp, email, spreadsheets) and can articulate why users would pay the switching tax.",
      yellow: "Workaround is identified but switching cost not analyzed; founder hopes users will switch.",
      red: "Founder hasn't asked why current users would leave their current solution. Switching cost is invisible to them.",
    },
    q3_desperate_specificity: {
      green: "Named retained users — not signups, retained — with role and what they use the product for.",
      yellow: "ICP narrowed but founder cannot point to the specific humans still using it.",
      red: "ICP is still a segment. Or churned users are unknown to the founder.",
    },
    q4_narrowest_wedge: {
      green: "The wedge is monetised. Founder is charging for the narrow version and deferring expansion until that wedge is solid.",
      yellow: "Wedge is unclear or has expanded prematurely; founder is adding features without PMF on the first one.",
      red: "Wedge expanded before PMF. Building a platform with no foundation.",
    },
    q5_observation_surprise: {
      green: "Founder watches usage and churn closely; quotes a specific retention or churn surprise that changed their priorities.",
      yellow: "Founder has dashboards but doesn't sit with users; surprises come from metrics not behaviour.",
      red: "No observation post-launch. Founder is building features instead of watching users.",
    },
    q6_future_fit: {
      green: "3-year tailwind named with evidence; story holds even if the founder's first cohort churns.",
      yellow: "Tailwind asserted; founder cannot connect it to the specific wedge they ship today.",
      red: "Future framing is unrelated to the product as it exists. Vague AI/tech-trend reasoning.",
    },
  },
};

// ---------------------------------------------------------------------------
// Question display labels (used for prompt assembly + report rendering).
// ---------------------------------------------------------------------------

export const QUESTION_LABEL: Record<QuestionKey, string> = {
  q1_demand_reality: "Q1 — DEMAND REALITY",
  q2_status_quo: "Q2 — STATUS QUO",
  q3_desperate_specificity: "Q3 — DESPERATE SPECIFICITY",
  q4_narrowest_wedge: "Q4 — NARROWEST WEDGE",
  q5_observation_surprise: "Q5 — OBSERVATION & SURPRISE",
  q6_future_fit: "Q6 — FUTURE-FIT",
};

export const QUESTION_TEXT: Record<QuestionKey, string> = {
  q1_demand_reality:
    "What's the strongest evidence you have that someone actually wants this — not 'is interested,' not 'signed up for a waitlist,' but would be genuinely upset if it disappeared tomorrow?",
  q2_status_quo:
    "What are your users doing right now to solve this problem — even badly? What does that workaround cost them?",
  q3_desperate_specificity:
    "Name the actual human who needs this most. What's their title? What gets them promoted? What gets them fired? What keeps them up at night?",
  q4_narrowest_wedge:
    "What's the smallest possible version of this that someone would pay real money for — this week, not after you build the platform?",
  q5_observation_surprise:
    "Have you actually sat down and watched someone use this without helping them? What did they do that surprised you?",
  q6_future_fit:
    "If the world looks meaningfully different in 3 years — and it will — does your product become more essential or less?",
};

// ---------------------------------------------------------------------------
// Phase 1 user message — the form, plain.
// ---------------------------------------------------------------------------

export function buildDiagnosePrompt(form: FormInput): string {
  const block = QUESTION_KEYS.map((key) => {
    return `${QUESTION_LABEL[key]}\nQuestion: ${QUESTION_TEXT[key]}\nAnswer: ${form.questions[key]}`;
  }).join("\n\n");

  return `STARTUP: ${form.startup_name}
ONE-LINER: ${form.one_liner}
STAGE: ${form.stage}

FOUNDER'S SUBMISSION TO THE SIX OFFICE-HOURS QUESTIONS:

${block}

---

Diagnose. Output the JSON object only — no prose outside the JSON.`;
}

// ---------------------------------------------------------------------------
// Phase 2 — grader. Map any non-supported stage to the closest supported one.
// ---------------------------------------------------------------------------

function supportedStage(stage: Stage): SupportedStage {
  if (stage === "idea" || stage === "pre_launch" || stage === "launched") {
    return stage;
  }
  return "launched";
}

function rubricBlock(stage: SupportedStage): string {
  const r = RUBRIC[stage];
  return QUESTION_KEYS.map((key) => {
    const band = r[key];
    return [
      `${QUESTION_LABEL[key]}`,
      `  GREEN  → ${band.green}`,
      `  YELLOW → ${band.yellow}`,
      `  RED    → ${band.red}`,
    ].join("\n");
  }).join("\n\n");
}

function diagnosisBlock(diagnosis: Diagnosis): string {
  return [
    `company_shape: ${diagnosis.company_shape}`,
    `stage_signals: ${diagnosis.stage_signals.join(" | ")}`,
    `dominant_failure_mode: ${diagnosis.dominant_failure_mode}`,
    `anti_patterns_suspected: ${diagnosis.anti_patterns_suspected.join(" | ")}`,
    `the_one_thing: ${diagnosis.the_one_thing}`,
    `retrieval_tags: ${diagnosis.retrieval_tags.join(", ")}`,
  ].join("\n");
}

export function buildGraderSystemPrompt(stage: Stage, diagnosis: Diagnosis): string {
  const s = supportedStage(stage);
  return `You are the writer for the YC Brain. You receive a diagnosis from the
office-hours partner, plus YC source material (essays, lectures, real
company stories). Your job is to write the founder's report.

HARD RULES — non-negotiable:
1. Use ONLY the SOURCES block and the COMPARABLES block. No outside
   knowledge. No generic startup advice.
2. Every \`quote\` field MUST appear VERBATIM in one of the SOURCES.
   Character-for-character including punctuation. If you cannot find a
   verbatim sentence that supports the analysis, set quote=null,
   source_title=null, source_url=null and write the analysis without one.
   Better no quote than a misleading one.
3. Apply the stage rubric STRICTLY. Do not soften red into yellow because
   the founder is trying.
4. Voice: match the VOICE EXAMPLES below exactly. Short paragraphs.
   Direct. No hedging. Never use "consider", "you might want to",
   "it's worth noting", "it could be helpful". State what is true.
5. Each \`next_action.text\` must be specific and time-boxed within 7 days.
   Bad: "validate market". Good: "Talk to 10 target users by Friday."
   \`deadline_days\` is an integer 1–7.
6. Comparables must be drawn from the COMPARABLES block, character-for-
   character on the company name, situation, action, result, lesson, url.
   Do not invent company anecdotes. Pick 2–3 most relevant. If the
   diagnosis flags a known anti-pattern that one of the failure
   comparables embodies, include that failure.
7. Prescribed reading: pick 2–3 sources from the SOURCES block. Each
   \`why_for_you\` is one sentence tying the source to the founder's
   specific situation.
8. \`headline\` is one PG-style sentence (≤25 words) — the load-bearing
   call. Refine \`the_one_thing\` from the diagnosis; do not just copy it.

Submit your output by calling the \`submit_analysis\` tool. No prose
outside the tool call.

VOICE EXAMPLES — write in this exact tone:

${VOICE_ANCHORS}

STAGE RUBRIC — ${s.toUpperCase()}:

${rubricBlock(s)}

DIAGNOSIS (from the partner — treat as ground truth):

${diagnosisBlock(diagnosis)}
`;
}

// ---------------------------------------------------------------------------
// Sources block — used by both the canon and inside the grader user message.
// ---------------------------------------------------------------------------

export function buildSourcesBlock(chunks: Chunk[]): string {
  return chunks
    .map((c, i) => {
      return [
        `[${i + 1}] SOURCE: "${c.source}" — ${c.author}`,
        `URL: ${c.url}`,
        `TOPICS: ${c.topics.join(", ")}`,
        ``,
        c.text,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Comparables block — structured records the grader can quote from for
// comparables[]. Tag-overlap retrieved, no embeddings.
// ---------------------------------------------------------------------------

export function buildComparablesBlock(records: Company[]): string {
  if (records.length === 0) {
    return "(no comparables matched the diagnosis tags at this stage)";
  }
  return records
    .map((c, i) => {
      return [
        `[C${i + 1}] ${c.company} (${c.year}, ${c.stage}, ${c.outcome})`,
        `TAGS: ${c.tags.join(", ")}`,
        `SITUATION: ${c.situation}`,
        `ACTION: ${c.action}`,
        `RESULT: ${c.result}`,
        `LESSON: ${c.lesson}`,
        `SOURCE: ${c.source}`,
        `URL: ${c.url}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Phase 2 user message.
// ---------------------------------------------------------------------------

export function buildGraderUserMessage(
  form: FormInput,
  diagnosis: Diagnosis,
  sourcesBlock: string,
  comparablesBlock: string,
): string {
  const formBlock = QUESTION_KEYS.map((key) => {
    return `${QUESTION_LABEL[key]}\nQuestion: ${QUESTION_TEXT[key]}\nAnswer: ${form.questions[key]}`;
  }).join("\n\n");

  return `STARTUP: ${form.startup_name}
ONE-LINER: ${form.one_liner}
STAGE: ${form.stage}

FOUNDER'S SUBMISSION:

${formBlock}

---

DIAGNOSIS (already shown in system prompt — repeated here for context):

${diagnosisBlock(diagnosis)}

---

SOURCES (PG essays + Startup School — use ONLY these for grading and quotes):

${sourcesBlock}

---

COMPARABLES (real YC-or-equivalent companies at your stage — use ONLY these for the comparables[] field):

${comparablesBlock}

---

Now grade each of the six office-hours questions, write the headline, pick 2–3 comparables and 2–3 prescribed reads. Submit by calling \`submit_analysis\`. Every quote must appear VERBATIM in the SOURCES above.`;
}
