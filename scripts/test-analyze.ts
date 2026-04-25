// Smoke test for /api/analyze. Run `npm run dev:api` in another terminal first.
//
// Squadova is the canonical regression fixture per docs/plan-brain-v2.md
// acceptance criterion 1: the diagnosis must mention the 0/4 cold activation
// signal and the switching-cost-vs-WhatsApp question. Override SAMPLE here for
// other test cases.

const ENDPOINT = process.env.ANALYZE_URL ?? "http://localhost:3000/api/analyze";

const SQUADOVA = {
  startup_name: "Squadova",
  one_liner:
    "A Belfast-based marketplace that helps casual football players find a local pickup match this week — book a slot, pay the pitch fee, show up.",
  stage: "launched" as const,
  questions: {
    q1_demand_reality:
      "About 10 weekly active users (WAU). Almost all are people in my warm network — friends and friends-of-friends I personally invited. We had our first paid Stripe payment last week. We've tried 4 cold pitchside activations (going to a 5-a-side venue, talking to people who showed up to play) and converted 0 of those into Squadova users. So the honest evidence is: warm-network friends will use it, strangers won't. I don't yet have anyone I'm confident would be furious if it disappeared tomorrow.",
    q2_status_quo:
      "Casual football players in Belfast organise via WhatsApp groups: someone posts 'pitch booked at Ozone Friday 7pm, need 2 more', people thumbs-up. The pitch is paid by the organiser who chases everyone for £6. Cost: organising friction, no-shows when only 8/10 turn up so the £60 pitch fee gets split painfully, and groups that drift apart when the organiser stops bothering. I have not formally measured how much time/money this costs because I haven't done structured user interviews — I just see it in the WhatsApp groups I'm already in.",
    q3_desperate_specificity:
      "Honestly the ICP I'm targeting is 'casual 5-a-side players in Belfast aged 22–35'. That's a segment, not a person. If I had to pick one human: an early-career engineer or office worker who used to play at uni, moved to Belfast for work, doesn't know enough people locally to keep a regular game going, and would pay £6–8 a week to walk onto a pitch with a guaranteed 9 other people. I haven't formally interviewed anyone like this — I am one.",
    q4_narrowest_wedge:
      "Smallest version: one venue, one slot per week (e.g. Ozone Friday 7pm), 10 players who book and pay through the app. That's already what I'm trying. The unresolved question is whether the wedge is 'existing teams who want easier admin' or 'solo+new groups who can't form a team without us' — those are very different products. I'm running both side by side this month and haven't decided.",
    q5_observation_surprise:
      "I have not run an unaided session. The only people who've used it have used it with me sitting next to them or texting them on WhatsApp. The closest thing to a surprise: at the 4 cold pitchside activations, people listened politely, said 'yeah cool', and never installed. Nobody pushed back, nobody asked questions, nobody tried it. Polite indifference, not engagement.",
    q6_future_fit:
      "I think the world in 3 years has more loose-ties social formats (gym classes, pickleball, padel, run clubs) and the WhatsApp-group model breaks at scale because organisers burn out. So a thin layer that makes ad-hoc pickup easier should become more essential. But I cannot prove this — it's a thesis, not evidence. I have 5 months of runway, £0 MRR, and the next milestone is to decide my beachhead by May 2.",
  },
};

const SAMPLE = SQUADOVA;

async function main() {
  console.log(`POST ${ENDPOINT}\n`);
  console.log(`Fixture: ${SAMPLE.startup_name} (${SAMPLE.stage})\n`);
  const start = Date.now();

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(SAMPLE),
  });

  const ms = Date.now() - start;
  console.log(`-> ${res.status} ${res.statusText}  (${ms}ms)\n`);

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    console.log(text);
    process.exit(res.ok ? 0 : 1);
  }

  if (!res.ok) {
    console.log(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  const out = body as {
    output: {
      headline: string;
      questions: Record<
        string,
        {
          grade: string | null;
          quote: string | null;
          source_title: string | null;
          source_url: string | null;
          analysis: string;
          next_actions: { text: string; deadline_days: number }[];
        }
      >;
      comparables: {
        company: string;
        stage: string;
        situation: string;
        action: string;
        result: string;
        lesson: string;
        url: string;
      }[];
      prescribed_reading: { title: string; url: string; why_for_you: string }[];
    };
    meta: {
      diagnosis: {
        company_shape: string;
        stage_signals: string[];
        dominant_failure_mode: string;
        anti_patterns_suspected: string[];
        the_one_thing: string;
        retrieval_tags: string[];
      };
      chunks_used: number;
      sources: string[];
      comparables_used: string[];
      attempt: number;
    };
  };

  console.log("=== DIAGNOSIS (Phase 1) ===");
  console.log(`  shape:           ${out.meta.diagnosis.company_shape}`);
  console.log(`  failure mode:    ${out.meta.diagnosis.dominant_failure_mode}`);
  console.log(`  signals:         ${out.meta.diagnosis.stage_signals.join(" | ")}`);
  console.log(`  anti-patterns:   ${out.meta.diagnosis.anti_patterns_suspected.join(" | ")}`);
  console.log(`  the one thing:   ${out.meta.diagnosis.the_one_thing}`);
  console.log(`  retrieval tags:  ${out.meta.diagnosis.retrieval_tags.join(", ")}`);
  console.log();

  console.log("=== HEADLINE ===");
  console.log(`  ${out.output.headline}`);
  console.log();

  console.log(
    `meta: ${out.meta.chunks_used} chunks across ${out.meta.sources.length} sources; comparables: ${out.meta.comparables_used.join(", ")} (attempt ${out.meta.attempt})`,
  );
  console.log(`sources: ${out.meta.sources.join("; ")}\n`);

  const lightFor = (g: string | null) =>
    g === "green"
      ? "[GREEN]"
      : g === "yellow"
        ? "[YELLOW]"
        : g === "red"
          ? "[RED]"
          : "[NONE]";

  for (const [key, sec] of Object.entries(out.output.questions)) {
    console.log(`=== ${key.toUpperCase()} ${lightFor(sec.grade)} ===`);
    if (sec.quote) {
      console.log(`  Quote: "${sec.quote}"`);
      console.log(`  Source: ${sec.source_title} — ${sec.source_url}`);
    } else {
      console.log(`  (no source quote)`);
    }
    console.log(`  Analysis: ${sec.analysis}`);
    if (sec.next_actions.length > 0) {
      console.log(`  Next actions:`);
      for (const a of sec.next_actions) {
        console.log(`    - [${a.deadline_days}d] ${a.text}`);
      }
    }
    console.log();
  }

  console.log("=== COMPARABLES ===");
  for (const c of out.output.comparables) {
    console.log(`  ${c.company} (${c.stage}) — ${c.lesson}`);
    console.log(`    ${c.url}`);
  }
  console.log();

  console.log("=== PRESCRIBED READING ===");
  for (const r of out.output.prescribed_reading) {
    console.log(`  ${r.title} — ${r.why_for_you}`);
    console.log(`    ${r.url}`);
  }
  console.log();

  // ---- Acceptance-criteria quick checks (advisory; non-fatal) ----
  const diag = out.meta.diagnosis;
  const checks: { name: string; ok: boolean }[] = [];
  const tagBlob = diag.retrieval_tags.join(" ").toLowerCase();
  const failureBlob = diag.dominant_failure_mode.toLowerCase();
  const allText =
    `${diag.the_one_thing} ${failureBlob} ${diag.stage_signals.join(" ")} ${diag.anti_patterns_suspected.join(" ")} ${out.output.headline}`.toLowerCase();

  checks.push({
    name: "Diagnosis names switching-cost / WhatsApp / free-incumbent",
    ok:
      /switching[- ]?cost|whatsapp|free[- ]incumbent|incumbent/.test(allText) ||
      /switching[- ]?cost|whatsapp/.test(tagBlob),
  });
  checks.push({
    name: "Diagnosis references the cold-activation / 0-of-4 signal",
    ok: /cold[- ]?activation|0\/4|cold[- ]?start|warm[- ]?network|pitchside/.test(allText) ||
      /cold[- ]?start|warm[- ]?network|activation/.test(tagBlob),
  });
  checks.push({
    name: "At least 2 comparables returned",
    ok: out.output.comparables.length >= 2,
  });
  checks.push({
    name: "All next_actions have deadline_days in 1..7",
    ok: Object.values(out.output.questions).every((q) =>
      q.next_actions.every((a) => a.deadline_days >= 1 && a.deadline_days <= 7),
    ),
  });
  const hedges = ["consider", "you might want to", "it's worth noting", "perhaps you could", "you may want to"];
  const allAnalysis = Object.values(out.output.questions)
    .map((q) => q.analysis)
    .join(" ")
    .toLowerCase();
  checks.push({
    name: "No hedge phrases in analysis",
    ok: hedges.every((h) => !allAnalysis.includes(h)),
  });
  const hasFailureComp = out.output.comparables.some((c) => /homejoy|munchery|sprig/i.test(c.company));
  checks.push({
    name: "At least one failure comparable surfaced (Homejoy/Munchery/Sprig)",
    ok: hasFailureComp,
  });

  console.log("=== ACCEPTANCE CHECKS ===");
  for (const c of checks) {
    console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
