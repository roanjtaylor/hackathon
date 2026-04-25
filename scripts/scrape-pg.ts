import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

type Stage = "idea" | "pre_launch" | "launched" | "revenue" | "growth" | "all";

interface SeedEntry {
  slug: string;
  url: string;
  topics: string[];
  stage: Stage[];
}

const SEED: SeedEntry[] = [
  {
    slug: "do-things-that-dont-scale",
    url: "http://paulgraham.com/ds.html",
    topics: ["growth", "customer", "sales", "manual_work"],
    stage: ["idea", "pre_launch", "launched"],
  },
  {
    slug: "how-to-get-startup-ideas",
    url: "http://paulgraham.com/startupideas.html",
    topics: ["ideas", "customer", "problem"],
    stage: ["idea"],
  },
  {
    slug: "startups-in-13-sentences",
    url: "http://paulgraham.com/13sentences.html",
    topics: ["fundamentals", "focus", "customer"],
    stage: ["all"],
  },
  {
    slug: "default-alive-or-default-dead",
    url: "http://paulgraham.com/aord.html",
    topics: ["metrics", "fundraising", "runway"],
    stage: ["revenue", "growth"],
  },
  {
    slug: "schlep-blindness",
    url: "http://paulgraham.com/schlep.html",
    topics: ["ideas", "problem", "hard_problems"],
    stage: ["idea"],
  },
  {
    slug: "how-to-start-a-startup",
    url: "http://paulgraham.com/start.html",
    topics: ["fundamentals", "founders", "cofounders", "ideas"],
    stage: ["all"],
  },
  {
    slug: "the-18-mistakes-that-kill-startups",
    url: "http://paulgraham.com/startupmistakes.html",
    topics: ["fundamentals", "founders", "focus", "cofounders"],
    stage: ["all"],
  },
  {
    slug: "why-to-not-not-start-a-startup",
    url: "http://paulgraham.com/notnot.html",
    topics: ["founders", "determination", "fundamentals"],
    stage: ["idea", "pre_launch"],
  },
  {
    slug: "be-good",
    url: "http://paulgraham.com/good.html",
    topics: ["fundamentals", "ideas", "customer", "problem"],
    stage: ["all"],
  },
  {
    slug: "the-hardest-lessons-for-startups-to-learn",
    url: "http://paulgraham.com/startuplessons.html",
    topics: ["fundamentals", "focus", "customer", "founders"],
    stage: ["all"],
  },
  {
    slug: "a-students-guide-to-startups",
    url: "http://paulgraham.com/mit.html",
    topics: ["founders", "cofounders", "fundamentals"],
    stage: ["idea", "pre_launch"],
  },
  {
    slug: "the-equity-equation",
    url: "http://paulgraham.com/equity.html",
    topics: ["fundraising", "investors", "cofounders"],
    stage: ["pre_launch", "launched", "revenue"],
  },
  {
    slug: "how-to-convince-investors",
    url: "http://paulgraham.com/convince.html",
    topics: ["fundraising", "investors", "pitching"],
    stage: ["pre_launch", "launched", "revenue"],
  },
  {
    slug: "how-to-raise-money",
    url: "http://paulgraham.com/fr.html",
    topics: ["fundraising", "investors", "pitching", "runway"],
    stage: ["launched", "revenue"],
  },
  {
    slug: "investor-herd-dynamics",
    url: "http://paulgraham.com/herd.html",
    topics: ["fundraising", "investors", "pitching"],
    stage: ["pre_launch", "launched", "revenue"],
  },
  {
    slug: "black-swan-farming",
    url: "http://paulgraham.com/swan.html",
    topics: ["investors", "ideas", "fundraising"],
    stage: ["all"],
  },
  {
    slug: "the-anatomy-of-determination",
    url: "http://paulgraham.com/determination.html",
    topics: ["determination", "founders", "fundamentals"],
    stage: ["all"],
  },
  {
    slug: "mean-people-fail",
    url: "http://paulgraham.com/mean.html",
    topics: ["founders", "fundamentals"],
    stage: ["all"],
  },
  {
    slug: "startup-equals-growth",
    url: "http://paulgraham.com/growth.html",
    topics: ["growth", "metrics", "fundamentals"],
    stage: ["launched", "revenue", "growth"],
  },
  {
    slug: "relentlessly-resourceful",
    url: "http://paulgraham.com/relres.html",
    topics: ["founders", "determination", "fundamentals"],
    stage: ["all"],
  },
  {
    slug: "makers-schedule-managers-schedule",
    url: "http://paulgraham.com/makersschedule.html",
    topics: ["focus", "founders", "hiring"],
    stage: ["launched", "revenue", "growth"],
  },
  {
    slug: "what-we-look-for-in-founders",
    url: "http://paulgraham.com/founders.html",
    topics: ["founders", "determination", "cofounders"],
    stage: ["idea", "pre_launch"],
  },
  {
    slug: "the-hackers-guide-to-investors",
    url: "http://paulgraham.com/guidetoinvestors.html",
    topics: ["fundraising", "investors", "pitching"],
    stage: ["pre_launch", "launched", "revenue"],
  },
  {
    slug: "ramen-profitable",
    url: "http://paulgraham.com/ramenprofitable.html",
    topics: ["revenue", "runway", "metrics", "fundamentals"],
    stage: ["launched", "revenue"],
  },
  {
    slug: "the-other-half-of-artists-ship",
    url: "http://paulgraham.com/artistsship.html",
    topics: ["focus", "founders", "fundamentals"],
    stage: ["all"],
  },
  {
    slug: "the-top-idea-in-your-mind",
    url: "http://paulgraham.com/top.html",
    topics: ["focus", "founders"],
    stage: ["all"],
  },
  {
    slug: "six-principles-for-making-new-things",
    url: "http://paulgraham.com/newthings.html",
    topics: ["ideas", "fundamentals", "problem"],
    stage: ["idea", "pre_launch"],
  },
  {
    slug: "frighteningly-ambitious-startup-ideas",
    url: "http://paulgraham.com/ambitious.html",
    topics: ["ideas", "problem", "hard_problems"],
    stage: ["idea"],
  },
  {
    slug: "organic-startup-ideas",
    url: "http://paulgraham.com/organic.html",
    topics: ["ideas", "problem", "founders"],
    stage: ["idea"],
  },
  {
    slug: "before-the-startup",
    url: "http://paulgraham.com/before.html",
    topics: ["founders", "fundamentals", "ideas"],
    stage: ["idea", "pre_launch"],
  },
];

const OUT_DIR = "content/pg-essays";

const td = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
});

// PG essays use legacy table layouts; the body lives inside the largest <font>.
function extractBody(doc: Document): Element {
  const fonts = Array.from(doc.querySelectorAll("font"));
  if (fonts.length === 0) throw new Error("no <font> elements found");
  fonts.sort(
    (a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0),
  );
  return fonts[0];
}

function extractTitle(doc: Document, fallback: string): string {
  const raw = doc.querySelector("title")?.textContent?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

function buildFrontmatter(entry: SeedEntry, title: string): string {
  return [
    "---",
    `source: "${title.replace(/"/g, '\\"')}"`,
    `author: "Paul Graham"`,
    `url: "${entry.url}"`,
    `topics: [${entry.topics.join(", ")}]`,
    `stage: [${entry.stage.join(", ")}]`,
    "---",
    "",
  ].join("\n");
}

async function scrape(entry: SeedEntry): Promise<{ slug: string; chars: number }> {
  const res = await fetch(entry.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${entry.url}`);
  const html = await res.text();

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const title = extractTitle(doc, entry.slug);
  const body = extractBody(doc);
  const markdown = td.turndown(body.innerHTML).trim();

  const fileBody = `${buildFrontmatter(entry, title)}\n# ${title}\n\n${markdown}\n`;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, `${entry.slug}.md`), fileBody, "utf8");

  return { slug: entry.slug, chars: markdown.length };
}

async function main() {
  let ok = 0;
  let fail = 0;
  for (const entry of SEED) {
    try {
      const { slug, chars } = await scrape(entry);
      console.log(`[ok]   ${slug}  (${chars} chars)`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[fail] ${entry.slug}  ${msg}`);
      fail++;
    }
  }
  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main();
