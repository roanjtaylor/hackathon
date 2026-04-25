import type { Chunk } from "./retrieval.js";
import type { FormInput, SectionKey, Stage } from "./schema.js";
import { SECTION_KEYS } from "./schema.js";

interface RubricBand {
  green: string;
  yellow: string;
  red: string;
}

type StageRubric = Record<SectionKey, RubricBand>;

// First-pass rubric. Tester refines after first real analyzer run on our own startups
// (per plan.md:260). Anchored on PG canon: "Default Alive", "Startup = Growth",
// "Do Things That Don't Scale", "How to Get Startup Ideas".
export const RUBRIC: Record<Stage, StageRubric> = {
  idea: {
    problem: {
      green: "Sharp, specific problem the founder has personally observed in 10+ users; can quote pain in users' own words.",
      yellow: "Problem named but mostly hypothesis; founder has heard the pain abstractly but cannot quote a user verbatim.",
      red: "Problem is vague, derived from gut, or framed as 'people might want X' with no observation.",
    },
    customer: {
      green: "10+ real conversations with target users, verbatim quotes captured, can name 3 specific people who'd use it day one.",
      yellow: "3–9 conversations, no captured quotes; ICP is identifiable but soft.",
      red: "0–2 conversations; ICP is 'everyone' or 'small businesses'; mostly assumptions.",
    },
    solution: {
      green: "Scoped to one painful job confirmed by user conversations; founder can describe the smallest useful version in one sentence.",
      yellow: "Solution exists but features are not tied to specific user feedback; some scope creep.",
      red: "Platform thinking, kitchen-sink feature list, or building before talking to users.",
    },
    traction: {
      green: "Not applicable at idea stage. Focus on conversations, not metrics. Treat as green if founder explicitly says 'no metrics yet, focusing on conversations'.",
      yellow: "Trying to measure too early — landing-page signups, mailing list, social followers.",
      red: "Vanity metrics presented as traction; founder is optimising for numbers instead of learning.",
    },
    biggest_blocker: {
      green: "Blocker is genuinely about validation — 'haven't talked to enough users', 'not sure which segment is most painful'.",
      yellow: "Blocker is technical or design polish before user contact.",
      red: "Blocker is fundraising, branding, naming, or any pre-product activity that delays talking to users.",
    },
  },
  pre_launch: {
    problem: {
      green: "Problem validated through user conversations; founder can quote users' words and name a moment of acute pain.",
      yellow: "Problem clear but validation is thin or second-hand.",
      red: "No user contact; problem is from gut or trend articles.",
    },
    customer: {
      green: "Specific ICP, can name 5+ users who'd use it day one and have verbally committed.",
      yellow: "ICP is broad ('SMBs', 'developers'); no day-one users named.",
      red: "'Everyone' or no ICP; building for an imagined user.",
    },
    solution: {
      green: "MVP scoped to one critical job, shipping in days not months; manual workflows are fine.",
      yellow: "MVP creeping in scope; founder is polishing before users have touched it.",
      red: "Building for months without launch; perfectionism or 'one more feature'.",
    },
    traction: {
      green: "Engaged waitlist (people replying, not just emails); a few users testing privately.",
      yellow: "Signups exist but no engagement signal; founder cannot name who is excited.",
      red: "No traction signals; or vanity signups treated as validation.",
    },
    biggest_blocker: {
      green: "Real ship-blockers: bugs, integration, last-mile UX.",
      yellow: "Polish, naming, marketing copy.",
      red: "Fundraising or hiring before launch; pre-product distractions.",
    },
  },
  launched: {
    problem: {
      green: "Users confirm by repeated usage; problem is 'hair on fire' for at least a few users.",
      yellow: "Some users, mixed signal — interest but not retention.",
      red: "Launched but no usage; the problem may not be real.",
    },
    customer: {
      green: "Retained users, organic word of mouth, or strong NPS from at least 10 users.",
      yellow: "Signups but visible churn; cohort retention drops fast.",
      red: "No retention; founder cannot point to anyone who came back this week.",
    },
    solution: {
      green: "Founder is doing things that don't scale — talking to every user, manual onboarding, hand-holding.",
      yellow: "Automating before PMF; founder is too far from users.",
      red: "Self-serve, dashboards, internal tooling work — anything but customer contact.",
    },
    traction: {
      green: "Weekly growth visible (5–7%/wk on a real metric like active users or revenue).",
      yellow: "Flat growth; metric is real but not moving.",
      red: "Declining growth, or no real metric being tracked.",
    },
    biggest_blocker: {
      green: "Retention, PMF, talking to churned users.",
      yellow: "Scaling, infra, hiring before PMF.",
      red: "Fundraising before retention is solved.",
    },
  },
  revenue: {
    problem: {
      green: "Users pay willingly and repeatedly; pricing reflects real value to them.",
      yellow: "Paying but only at deep discounts or via heavy sales lift.",
      red: "Giving away free; cannot get anyone to pay.",
    },
    customer: {
      green: "Same buyer pulls in additional team members or accounts; expansion within accounts is happening.",
      yellow: "Scattered single users, no expansion, lots of one-and-done deals.",
      red: "High churn; net revenue is shrinking even with new logos.",
    },
    solution: {
      green: "Pricing reflects measured value; renewal rate is healthy.",
      yellow: "Pricing is a guess; founder doesn't know what each customer is willing to pay.",
      red: "No monetization model; revenue is accidental.",
    },
    traction: {
      green: "MRR growing 5–7%/wk or net revenue retention >100%; default-alive trajectory clear.",
      yellow: "Flat MRR; default-dead trajectory if nothing changes.",
      red: "Declining MRR or runway shrinking faster than revenue is growing.",
    },
    biggest_blocker: {
      green: "Sales motion, repeatable process, expanding the buyer side.",
      yellow: "Pricing experiments, discount strategy.",
      red: "A product gap that paying users keep flagging — solve before scaling sales.",
    },
  },
  growth: {
    problem: {
      green: "Large addressable market verified by paid acquisition working at sustainable CAC.",
      yellow: "Market signals mixed; CAC creeping up; growth is bought not earned.",
      red: "Market smaller than thought; ceiling visible.",
    },
    customer: {
      green: "Repeatable acquisition channel with positive unit economics; you know which channel and why.",
      yellow: "One channel works but not scaling; second channel attempts are failing.",
      red: "No scalable channel; growth is from founder hustle, not a system.",
    },
    solution: {
      green: "Product holds quality at scale; ops scale with revenue, not with headcount.",
      yellow: "Quality slipping at scale; support tickets growing faster than revenue.",
      red: "Ops crushing product work; founders are pulled into fire-fighting daily.",
    },
    traction: {
      green: "Capital-efficient growth, healthy LTV/CAC (>3), default-alive even without new fundraising.",
      yellow: "Growth bought with subsidies; unit economics fragile.",
      red: "Unit economics negative; growing makes you lose more money.",
    },
    biggest_blocker: {
      green: "Hiring senior leaders, distribution, geographic expansion.",
      yellow: "Internal ops, tooling, process.",
      red: "Founder bottleneck — every decision still routes through founders.",
    },
  },
};

const SECTION_LABEL: Record<SectionKey, string> = {
  problem: "PROBLEM",
  customer: "CUSTOMER",
  solution: "SOLUTION",
  traction: "TRACTION",
  biggest_blocker: "BIGGEST BLOCKER",
};

function rubricBlock(stage: Stage): string {
  const r = RUBRIC[stage];
  return SECTION_KEYS.map((key) => {
    const band = r[key];
    return [
      `${SECTION_LABEL[key]}`,
      `  GREEN  → ${band.green}`,
      `  YELLOW → ${band.yellow}`,
      `  RED    → ${band.red}`,
    ].join("\n");
  }).join("\n\n");
}

export function buildSystemPrompt(stage: Stage): string {
  return `You are the YC analyzer for a founder feedback tool. You evaluate a founder's startup using ONLY the YC source material in the SOURCES block of the user message. Your voice is Paul Graham's: direct, concrete, no hedging, no sycophancy. Founders benefit from hard truths, not encouragement theatre.

HARD RULES — non-negotiable:
1. Use ONLY the SOURCES block. Do NOT draw on training data, generic startup advice, or "common wisdom" that is not in SOURCES.
2. Every \`quote\` MUST appear VERBATIM in one of the SOURCES. Copy character-for-character including punctuation and capitalisation. If you cannot find a verbatim sentence, set quote=null.
3. If no source supports a section, return: grade=null, quote=null, source_title=null, source_url=null, analysis="No YC source covers this directly. Closest adjacent guidance: ..." (still grounded in SOURCES if possible).
4. Do NOT invent statistics. Do NOT attribute claims to YC partners not present in SOURCES.
5. \`next_actions\` must be specific and time-boxed within 7 days. Good: "Talk to 10 target users by Friday." Bad: "Validate market." Each action gets a deadline_days integer (1–7).
6. \`analysis\` is 2–3 sentences in PG's voice. Direct. No hedging. No "consider" or "you might want to". State what is true.
7. Apply the per-stage rubric STRICTLY. Do not soften a red into a yellow because the founder seems to be trying hard.

You MUST submit your output by calling the \`submit_analysis\` tool. Do NOT respond in plain text.

STAGE: ${stage.toUpperCase()}

RUBRIC FOR ${stage.toUpperCase()} STAGE:

${rubricBlock(stage)}
`;
}

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

export function buildUserMessage(form: FormInput, sourcesBlock: string): string {
  const formBlock = SECTION_KEYS.map(
    (key) => `${SECTION_LABEL[key]}:\n${form.sections[key]}`,
  ).join("\n\n");

  return `STARTUP: ${form.startup_name}
ONE-LINER: ${form.one_liner}
STAGE: ${form.stage}

FOUNDER'S SUBMISSION:

${formBlock}

---

SOURCES (use ONLY these for grading and quotes):

${sourcesBlock}

---

Now grade each of the 5 sections (problem, customer, solution, traction, biggest_blocker) by calling \`submit_analysis\`. Every quote must appear VERBATIM in the SOURCES above.`;
}
