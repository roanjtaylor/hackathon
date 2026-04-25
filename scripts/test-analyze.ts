// Smoke test for /api/analyze. Run `vercel dev` in another terminal first.
// Edit SAMPLE below to test different startup states.

const ENDPOINT = process.env.ANALYZE_URL ?? "http://localhost:3000/api/analyze";

const SAMPLE = {
  startup_name: "Belfast Founders",
  one_liner:
    "Interactive YC Startup School — a tool that grades a founder's startup section-by-section using only Paul Graham essays and Startup School lectures, with verbatim citations.",
  stage: "idea" as const,
  sections: {
    problem:
      "Founders outside Silicon Valley don't have YC's playbooks, network, or accountability. They read 200 PG essays hoping one fits their situation this week, instead of getting the right advice for their stage right now. We've felt this ourselves building in Belfast.",
    customer:
      "Northern Ireland founders at idea or pre-launch stage. We've talked to about 4 NI founders informally, none with captured verbatim quotes yet. We're building this for ourselves first — we are the customer.",
    solution:
      "A web app where a founder fills in Problem / Customer / Solution / Traction / Blocker. The tool retrieves the most relevant chunks from a YC corpus, asks Claude to grade each section with verbatim PG quotes and 1–2 commitments per section. Tracker tab shows weekly entries and grade history over time.",
    traction:
      "No traction yet — building this weekend at the hackathon. No waitlist, no signups, no users besides the team.",
    biggest_blocker:
      "We haven't done enough founder interviews to know whether the form structure (Problem/Customer/Solution/Traction/Blocker) is actually how NI founders think about their startup, or whether the traffic-light grading would feel patronising to experienced founders.",
  },
};

async function main() {
  console.log(`POST ${ENDPOINT}\n`);
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
    output: Record<string, {
      grade: string | null;
      quote: string | null;
      source_title: string | null;
      source_url: string | null;
      analysis: string;
      next_actions: { text: string; deadline_days: number }[];
    }>;
    meta: { chunks_used: number; sources: string[]; attempt: number };
  };

  console.log(
    `meta: ${out.meta.chunks_used} chunks across ${out.meta.sources.length} sources (attempt ${out.meta.attempt})`,
  );
  console.log(`sources: ${out.meta.sources.join("; ")}\n`);

  const lightFor = (g: string | null) =>
    g === "green" ? "[GREEN]" : g === "yellow" ? "[YELLOW]" : g === "red" ? "[RED]" : "[NONE]";

  for (const [key, sec] of Object.entries(out.output)) {
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
