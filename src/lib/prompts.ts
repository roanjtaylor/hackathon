import type { Chunk, YcCohort } from "./retrieval.js";
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
essay and watched every Startup School lecture, including Peter Thiel's
"Competition is for Losers". You have also internalised the public
commentary of Paddy Cosgrave (Web Summit) on startup base rates and the
power-law of outcomes. You think the way Paul Graham thinks about
PRODUCT and DEMAND, the way Peter Thiel thinks about MARKETS and
COMPETITION, and the way Paddy Cosgrave thinks about BASE RATES and the
HEAVY-TAILED nature of startup outcomes. All three lenses are always on.

PG-AXIS PRINCIPLES — product / demand:
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

COSGRAVE-AXIS PRINCIPLES — base rates / power-law / anti-mythology:
- The default outcome is failure or stagnation, not success. Among YC's
  mature batches, ~25% are inactive (dead), ~25% are acquired or public,
  the rest are still grinding with unproven futures. For non-YC startups
  the failure base rate is worse. Treat success as the rare event it is.
- Outcomes are heavy-tailed. A handful of winners produce the vast
  majority of returns; the rest cluster near zero. Most "successful"
  VC-backed companies never become profitable — they raise, grow, and
  either exit or die before unit economics matter. Many are zombies.
- VC capital can extend a doomed company's life without changing its
  fate. A big round is not validation; it is a longer runway over the
  same cliff. Burn-funded growth without a path to profit is a delayed
  funeral, not a business.
- Founder skill is necessary but not sufficient. Right time × right
  place × right team × right idea — three of four is usually fatal.
  Survivorship bias makes outcomes look more deterministic in
  retrospect than they were prospectively. The same founder, same idea,
  different year, often fails.
- The hero-founder narrative obscures the carnage. For every Stripe
  there are 200 unremembered payment startups that died. Reading only
  case studies of winners teaches you almost nothing because you cannot
  see the variance.
- YC's per-company hit rate has compressed as batch size has grown.
  Early batches (S05–W10, ~10–30 companies) produced disproportionate
  unicorns; recent batches (300–400 companies) have far lower top-company
  density. Being accepted is not the validation it once was.
- The honest prior: this startup will most likely fail. The burden of
  proof is on the founder to show why this one beats the base rate —
  with evidence, not narrative. Absent strong evidence, default to
  failure in your reasoning.

THIEL-AXIS PRINCIPLES — market structure / value capture:
- Competition is for losers. Aim for monopoly; avoid hyper-competition.
  Capitalism and competition are antonyms.
- A valuable company creates X dollars of value AND captures Y% of X.
  X and Y are independent. Big market with low Y (airlines) is a worse
  business than smaller market with high Y (Google search).
- Two kinds of business: perfectly competitive, and monopoly. There is
  shockingly little in between. Founders systematically lie in opposite
  directions: monopolists pretend to be competitive (to dodge regulation),
  competitive firms pretend to be unique (to attract capital). Both lies
  obscure the truth — name what you actually see.
- Start with a small, dominable market. Concentric expansion outward.
  Going after a giant market on day one is evidence the founder hasn't
  defined the category correctly. PayPal began with eBay power-sellers
  (~20k people). Facebook with 10k Harvard students. Amazon with books.
- Last mover beats first mover. Be the last company in a category, not
  the first. Most of a tech company's value sits in cash flows 10+ years
  out, so durability dominates current growth rate.
- Four monopoly characteristics: proprietary technology (10x better than
  the next best thing), network effects, economies of scale, brand. Score
  the company on all four. Network effects strengthen with time;
  proprietary tech can be superseded — ask whether the moat lasts.
- "All happy companies are different; all unhappy companies are alike"
  — they fail to escape the essential sameness of competition. If a
  founder cannot articulate why their company is structurally different,
  assume it is not.
- Mimetic competition is a psychological trap. People imitate, then
  fight ferociously over differences that are mostly imaginary. A market
  being crowded is often evidence of insanity, not validation.
- The "intersection lie" (we're the only X-for-Y in Z) usually = no real
  market. The "union lie" (we compete in a $1T tech market) usually =
  hidden monopoly that's afraid to be named.
- Code is no longer a moat. With AI coding assistants a competent solo
  dev can clone a typical mid-feature SaaS in a weekend. So when scoring
  the four moats, ask: "if a competitor could rebuild this product in
  two weeks with Claude, what survives?" If the answer is "nothing",
  the company has no moat regardless of how clean the codebase is.
  Surviving moats now skew toward: network effects, proprietary DATA
  flywheels (not proprietary code), distribution / brand, deep workflow
  integration with months of switching cost, regulatory/compliance,
  physical operations, and trust in high-stakes domains. "We'll execute
  faster" and "our code is better" are not moats in 2026.

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
  set when applicable.
  PG-axis (product/demand): marketplace, two-sided, switching-cost,
    activation, doing-things-that-dont-scale, warm-network, cold-start,
    narrow-wedge, pivot, idea-validation, demand-validation,
    premature-scale, false-pmf, unit-economics, retention, supply-side,
    founder-closeness, manual-ops, fundraising-bridge, mvp.
  Thiel-axis (market structure): monopoly, competitive-market,
    value-capture, last-mover, proprietary-tech, network-effects,
    economies-of-scale, branding, niche-domination, concentric-expansion,
    differentiation, mimetic-competition, intersection-lie, union-lie,
    vertical-integration, durable-moat, code-as-moat-eroded,
    claude-cloneable, data-flywheel, distribution-moat,
    workflow-depth-moat.
  Cosgrave-axis (base rates / power-law): high-base-rate-failure,
    power-law-outcome, survivorship-bias, luck-premium, zombie-startup,
    burn-funded-growth, vc-extension-not-validation, hero-narrative,
    delayed-funeral, batch-dilution, unprofitable-by-design,
    timing-dependence.
  Tag all axes that apply. A founder pitching "the AI X for enterprises"
  in 2026 is a demand-validation problem (PG), a competitive-market /
  no-moat problem (Thiel), AND a high-base-rate-failure / batch-dilution
  problem (Cosgrave) simultaneously. Name all three.`;

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
      green: "One painful job, smallest version describable in one sentence; could be sold for real money this week. Founder has chosen the wedge specifically because it is small enough to dominate, with a credible concentric-expansion path (Thiel: PayPal → eBay power-sellers → broader payments).",
      yellow: "Scope creep, platform thinking, 'eventually we'll do X and Y too'. Or: wedge is narrow but dominability is unexamined — founder hasn't asked whether they can be #1 in this slice.",
      red: "Kitchen-sink feature list. Founder is building a platform before they've sold a single wedge. Or: targeting a giant market on day one ('we're in the $X-billion AI/health/fintech market'), which is the union-lie pattern that obscures real competition.",
    },
    q5_observation_surprise: {
      green: "Founder has watched at least one user attempt the task without help and quotes the moment of surprise.",
      yellow: "Heard about usage second-hand or only seen friendly users.",
      red: "No observation. Founder cannot tell you what surprised them because they haven't watched.",
    },
    q6_future_fit: {
      green: "Specific 3-year tailwind named with concrete evidence (regulation, demographic shift, cost curve). Founder can name at least one durable moat that emerges as the company grows — proprietary tech, network effects, economies of scale, or brand — and explain why they will be the LAST mover in this category, not the first. The moat survives the AI-cloneability test: if a competent dev with Claude rebuilt the product in two weeks, something material would still remain (network, data, distribution, integration depth, regulatory).",
      yellow: "Tailwind asserted but no evidence beyond 'AI will help' or 'people are getting more X'. Or: tailwind is plausible but no moat thesis — founder hasn't said why a competitor with more capital can't replicate this in 18 months. Or: claimed moat is code quality / execution speed, which AI assistants have eroded.",
      red: "Future framing is a trend deck or hand-wave. No reason this is more essential in 3 years than today. Or: founder dismisses the moat question — 'we'll just move faster' is not a moat. Or: product fails the AI-cloneability test — a weekend with Claude reproduces the entire value proposition.",
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
      green: "Shipping in days; manual workflows are explicitly fine; founder will charge for the smallest possible version. The wedge is small enough that the founder can credibly take >50% share of it, with a named concentric-expansion path beyond.",
      yellow: "Feature creep is delaying launch by weeks. Founder is polishing before any user has touched it. Or: wedge is shippable but founder cannot articulate why they will dominate this slice rather than tie with two near-clones.",
      red: "Months without launch. The wedge keeps growing because it's safer than shipping. Or: wedge is defined by an intersection-lie ('the only X-for-Y in Z') with no real customer base under the intersection.",
    },
    q5_observation_surprise: {
      green: "Founder has run an unaided session — recorded or in person — and can name a specific surprise that changed their thinking.",
      yellow: "Heard about usage second-hand, no in-person observation.",
      red: "No one has used it without help. Or only friends/family, who don't count.",
    },
    q6_future_fit: {
      green: "3-year tailwind named with evidence; founder can articulate why the wedge expands as the world shifts AND name a moat that compounds — network effects strengthening with the network, proprietary tech with a sustainable lead, or economies of scale. Moat passes the AI-cloneability test: a Claude-armed competitor would still face network, data, distribution, integration, or regulatory barriers.",
      yellow: "Tailwind asserted, no evidence; story is plausible but unsubstantiated. Or: founder claims a moat (e.g. 'data flywheel') without explaining why it actually deters a well-funded competitor. Or: claimed moat is execution / code quality, which AI has commoditised.",
      red: "Future framing is 'AI is changing everything' or trend deck. No specific reason this becomes more essential. Or: zero moat thesis — founder is implicitly betting on perpetual better execution, which is the textbook competitive-market trap. Or: product is Claude-cloneable in a weekend with no remaining moat.",
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
      green: "The wedge is monetised. Founder is charging for the narrow version and deferring expansion until that wedge is solid, AND has crossed (or is close to) majority share within the defined wedge — a real foothold, not a dispersed presence.",
      yellow: "Wedge is unclear or has expanded prematurely; founder is adding features without PMF on the first one. Or: wedge is monetised but share within it is low and stagnant, signalling the wedge was wrongly drawn or is genuinely competitive.",
      red: "Wedge expanded before PMF. Building a platform with no foundation. Or: founder cannot state share-of-wedge — they're competing in a perfectly competitive slice and accumulating revenue without accumulating market power.",
    },
    q5_observation_surprise: {
      green: "Founder watches usage and churn closely; quotes a specific retention or churn surprise that changed their priorities.",
      yellow: "Founder has dashboards but doesn't sit with users; surprises come from metrics not behaviour.",
      red: "No observation post-launch. Founder is building features instead of watching users.",
    },
    q6_future_fit: {
      green: "3-year tailwind named with evidence; story holds even if the founder's first cohort churns. At least one of the four monopoly characteristics (proprietary tech 10x, network effects, economies of scale, brand) is demonstrably present TODAY, not promised for later — and the founder can argue why this puts them on the last-mover trajectory. The today-moat survives the AI-cloneability test: a competitor rebuilding the product with Claude in two weeks still hits network, data, distribution, integration, or regulatory walls.",
      yellow: "Tailwind asserted; founder cannot connect it to the specific wedge they ship today. Or: a moat is named but unverified — e.g. 'we have network effects' when the network is small enough that pulling 100 users to a competitor would break it. Or: moat reduces to code quality / execution, which AI has eroded.",
      red: "Future framing is unrelated to the product as it exists. Vague AI/tech-trend reasoning. Or: no moat exists or is plausible — the company is structurally a competitive-market business, and the only differentiation is execution speed. Or: the product is Claude-cloneable in a weekend and nothing else remains.",
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
5a. SCORING — every question gets an integer \`score\` 0–100 that MUST sit
   inside the band implied by its grade:
     RED    →  0–39   (use 0–15 for "no signal at all", 25–39 for "weak gestures")
     YELLOW → 40–69   (use 40–55 for "barely yellow", 56–69 for "almost green")
     GREEN  → 70–100  (use 70–84 for "solid green", 85–100 for "exemplary canon-grade")
   Use the full range — do not anchor every answer at the midpoint. The
   score is what differentiates two startups with the same colour. If
   \`grade\` is null, \`score\` is null. The overall hackathon score is
   computed downstream as the average of the six \`score\` values, so be
   honest and discriminating.
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
   FORBIDDEN in the headline: hero-narrative phrasing ("you can be the
   1%", "this could be the next…", "all you need to do is…"), false
   binaries, and any framing that ignores base rates. The headline must
   be calibrated — if the cohort math says this company sits in a 70%
   fail bucket, the headline reflects that.
9a. THREE LENSES — apply all three when grading. The PG axis (product /
   demand / talking to users / narrow wedge), the Thiel axis (monopoly /
   competition / value capture / last mover / four moats: proprietary
   tech, network effects, economies of scale, brand), and the Cosgrave
   axis (base rates / power-law outcomes / heavy-tailed wins / default-
   failure prior / hero-narrative skepticism). A founder can pass one
   lens and fail another — call out which. Most founders fail at least
   two of the three; pretending otherwise is dishonest grading.
9aa. BASE-RATE CALIBRATION (Cosgrave) — your default prior for any
   submission is that this company most likely fails or stagnates,
   matching the YC cohort base rate shown in the YC COHORT CONTEXT
   block. Required behaviour:
   - Reference the cohort base rate at least once across the six
     analyses, in the question where it most sharpens the call (usually
     Q1 or Q6). Use the actual % from the cohort block — do not invent
     numbers.
   - Do NOT grade GREEN on Q1 or Q6 unless the founder's evidence
     would plausibly place them in the top quartile of their cohort.
     Surface "yes" answers, asserted tailwinds, and "we'll execute
     better" claims do not clear that bar — most failed companies
     said the same things.
   - Do NOT use VC-rounds, accelerator acceptance, press, or social
     proof as evidence of demand or moat. They are coincident with
     failure as often as success in the cohort data.
   - The fail-by-default prior does NOT mean grade everything red.
     Strong demand evidence + a credible moat + a small dominable
     wedge can still earn green. The prior is what you start from
     before reading the submission, not what you end at.
9. YC COHORT CONTEXT is real outcome data — n, % died, % acquired, % public,
   plus named peer companies with their actual fate (Inactive=died, Acquired,
   Public, Active, top_company=growing). You may cite these companies and
   percentages in the \`analysis\` prose for any question — they are ground
   truth from YC's own directory. Use them when a fact like "of the 124
   YC marketplace startups in mature batches, 38 died and 22 exited" sharpens
   the founder's picture. Do NOT put YC cohort companies into \`comparables[]\`
   — that field stays pinned to the COMPARABLES block (which has full
   situation/action/result narratives). Do NOT invent percentages or company
   fates beyond what the cohort block states.

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
// YC cohort block — quantitative outcomes from the full YC directory (5,856
// companies). Distinct from COMPARABLES: this is statistics + named peers, not
// SAR narratives. The grader is allowed to cite these companies and outcomes
// in the analysis prose, but NOT in the structured comparables[] field (which
// remains pinned to the hand-curated COMPARABLES block with full SAR records).
// ---------------------------------------------------------------------------

export function buildYcCohortBlock(cohort: YcCohort): string {
  const { stats, representatives, mature_only, query_terms } = cohort;
  if (stats.n === 0 || representatives.length === 0) {
    return "(no YC companies matched this diagnosis — sector too novel or terms too specific)";
  }
  const cohortNote = mature_only
    ? `Outcomes computed on MATURE batches only (≥5y old), so survivorship bias is controlled.`
    : `Sector is YC-young: outcomes include recent batches that haven't had time to fail or exit. Treat percentages as preliminary.`;

  const repLines = representatives.map((c, i) => {
    const outcome =
      c.status === "Inactive"
        ? "DIED"
        : c.status === "Public"
          ? "PUBLIC (IPO)"
          : c.status === "Acquired"
            ? "ACQUIRED"
            : c.top_company
              ? "ALIVE & growing (top_company)"
              : "alive";
    const oneLine = c.one_liner ? c.one_liner.replace(/\s+/g, " ").slice(0, 140) : "";
    return `[Y${i + 1}] ${c.name} — ${c.batch} — ${outcome}${oneLine ? ` — "${oneLine}"` : ""}${c.website ? ` — ${c.website}` : ""}`;
  }).join("\n");

  return [
    `MATCHED ON: ${query_terms.slice(0, 12).join(", ")}`,
    ``,
    `COHORT OUTCOMES (n=${stats.n}):`,
    `  alive (Active):      ${stats.active}  (${stats.pct.active}%)`,
    `  died (Inactive):     ${stats.inactive}  (${stats.pct.inactive}%)`,
    `  acquired:            ${stats.acquired}  (${stats.pct.acquired}%)`,
    `  public (IPO):        ${stats.public}  (${stats.pct.public}%)`,
    `  YC top_company flag: ${stats.top_company}  (${stats.pct.top_company}%)`,
    ``,
    cohortNote,
    ``,
    `REPRESENTATIVE COMPANIES (named peers from this cohort — you may cite by name in your analysis):`,
    repLines,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Phase 2 user message.
// ---------------------------------------------------------------------------

export function buildGraderUserMessage(
  form: FormInput,
  diagnosis: Diagnosis,
  sourcesBlock: string,
  comparablesBlock: string,
  ycCohortBlock: string,
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

YC COHORT CONTEXT (real outcome statistics from the full YC directory — 5,856 companies — for sector-similar peers; cite by name in \`analysis\` prose, NOT in comparables[]):

${ycCohortBlock}

---

Now grade each of the six office-hours questions, write the headline, pick 2–3 comparables and 2–3 prescribed reads. Submit by calling \`submit_analysis\`. Every quote must appear VERBATIM in the SOURCES above.`;
}
