// The package's package.json sets `main` to a CommonJS file but `type: "module"`
// in its own package.json — Node's ESM loader picks the CJS file and the named
// exports aren't exposed. Import the ESM bundle directly.
import { YoutubeTranscript } from "youtube-transcript/dist/youtube-transcript.esm.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

type Stage = "idea" | "pre_launch" | "launched" | "revenue" | "growth" | "all";

interface SeedEntry {
  slug: string;
  videoId: string;
  title: string;
  author: string;
  url: string;
  topics: string[];
  stage: Stage[];
}

const SEED: SeedEntry[] = [
  {
    slug: "how-to-start-a-startup-lecture-1",
    videoId: "CBYhVcO4WgI",
    title: "How to Start a Startup — Lecture 1: Welcome and Ideas, Products, Teams and Execution",
    author: "Sam Altman",
    url: "https://www.youtube.com/watch?v=CBYhVcO4WgI",
    topics: ["fundamentals", "ideas", "founders", "cofounders", "growth"],
    stage: ["idea", "pre_launch", "all"],
  },
  {
    slug: "team-and-execution",
    videoId: "CVfnkM44Urs",
    title: "How to Start a Startup — Lecture 2: Team and Execution",
    author: "Sam Altman",
    url: "https://www.youtube.com/watch?v=CVfnkM44Urs",
    topics: ["founders", "cofounders", "hiring", "focus", "fundamentals"],
    stage: ["pre_launch", "launched", "all"],
  },
  {
    slug: "before-the-startup-lecture",
    videoId: "ii1jcLg-eIQ",
    title: "How to Start a Startup — Lecture 3: Before the Startup",
    author: "Paul Graham",
    url: "https://www.youtube.com/watch?v=ii1jcLg-eIQ",
    topics: ["founders", "fundamentals", "ideas", "determination"],
    stage: ["idea", "pre_launch"],
  },
  {
    slug: "competition-is-for-losers",
    videoId: "5_0dVHMpJlo",
    title: "How to Start a Startup — Lecture 5: Competition is for Losers",
    author: "Peter Thiel",
    url: "https://www.youtube.com/watch?v=5_0dVHMpJlo",
    topics: ["ideas", "fundamentals", "problem", "hard_problems"],
    stage: ["idea", "pre_launch", "launched"],
  },
  {
    slug: "building-product",
    videoId: "C27RVio2rOs",
    title: "Building Product",
    author: "Michael Seibel",
    url: "https://www.youtube.com/watch?v=C27RVio2rOs",
    topics: ["customer", "product", "fundamentals", "focus"],
    stage: ["pre_launch", "launched"],
  },
  {
    slug: "how-to-plan-an-mvp",
    videoId: "1hHMwLxN6EM",
    title: "How to Plan an MVP",
    author: "Michael Seibel",
    url: "https://www.youtube.com/watch?v=1hHMwLxN6EM",
    topics: ["product", "customer", "ideas", "focus"],
    stage: ["idea", "pre_launch"],
  },
  {
    slug: "how-to-evaluate-startup-ideas",
    videoId: "DOtCl5PU8F0",
    title: "How to Evaluate Startup Ideas",
    author: "Kevin Hale",
    url: "https://www.youtube.com/watch?v=DOtCl5PU8F0",
    topics: ["ideas", "problem", "customer", "fundamentals"],
    stage: ["idea", "pre_launch"],
  },
  {
    slug: "how-to-prioritize-your-time",
    videoId: "XcCmMOWuAF4",
    title: "How to Prioritize Your Time",
    author: "Adora Cheung",
    url: "https://www.youtube.com/watch?v=XcCmMOWuAF4",
    topics: ["focus", "founders", "metrics", "fundamentals"],
    stage: ["all"],
  },
  {
    slug: "all-about-pivoting",
    videoId: "8pNxKX1SUGE",
    title: "All About Pivoting",
    author: "Dalton Caldwell",
    url: "https://www.youtube.com/watch?v=8pNxKX1SUGE",
    topics: ["ideas", "founders", "fundamentals", "problem"],
    stage: ["pre_launch", "launched"],
  },
  {
    slug: "fundraising-fundamentals",
    videoId: "gcevHkNGrWQ",
    title: "Fundraising Fundamentals",
    author: "Geoff Ralston",
    url: "https://www.youtube.com/watch?v=gcevHkNGrWQ",
    topics: ["fundraising", "investors", "pitching", "runway"],
    stage: ["pre_launch", "launched", "revenue"],
  },
  {
    slug: "how-to-sell",
    videoId: "xZi4kTJG-LE",
    title: "How to Sell",
    author: "Tyler Bosmeny",
    url: "https://www.youtube.com/watch?v=xZi4kTJG-LE",
    topics: ["sales", "customer", "growth", "revenue"],
    stage: ["launched", "revenue", "growth"],
  },
];

const OUT_DIR = "content/startup-school";

// Light cleanup: drop bracketed cues, collapse whitespace, fix common
// auto-caption artifacts. We deliberately don't try to repunctuate — for
// retrieval purposes the text only needs to be readable + searchable.
function cleanTranscript(segments: { text: string }[]): string {
  const joined = segments
    .map((s) => s.text)
    .join(" ")
    // bracketed cues like [Music], [Applause], [inaudible]
    .replace(/\[[^\]]*\]/g, " ")
    // parenthesized cues like (laughter)
    .replace(/\([^)]*\)/g, " ")
    // common HTML entities the parser may emit
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&nbsp;/g, " ")
    // newlines from XML are noise here
    .replace(/[\r\n]+/g, " ")
    // collapse runs of whitespace
    .replace(/\s+/g, " ")
    .trim();

  // Re-wrap into rough paragraphs (~600 char) on sentence boundaries so the
  // markdown is human-readable instead of one giant line.
  return wrapParagraphs(joined, 600);
}

function wrapParagraphs(text: string, target: number): string {
  // Split into sentences naïvely. Auto-captions often lack sentence
  // punctuation, so we also fall back to splitting on commas if needed.
  const sentences = text.split(/(?<=[.!?])\s+/);
  const paragraphs: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf.length === 0) {
      buf = s;
    } else if (buf.length + 1 + s.length < target) {
      buf += " " + s;
    } else {
      paragraphs.push(buf);
      buf = s;
    }
  }
  if (buf.length > 0) paragraphs.push(buf);
  return paragraphs.join("\n\n");
}

function buildFrontmatter(entry: SeedEntry): string {
  return [
    "---",
    `source: "${entry.title.replace(/"/g, '\\"')}"`,
    `author: "${entry.author.replace(/"/g, '\\"')}"`,
    `url: "${entry.url}"`,
    `topics: [${entry.topics.join(", ")}]`,
    `stage: [${entry.stage.join(", ")}]`,
    "---",
    "",
  ].join("\n");
}

async function scrape(entry: SeedEntry): Promise<{ slug: string; chars: number }> {
  const segments = await YoutubeTranscript.fetchTranscript(entry.videoId, {
    lang: "en",
  });
  if (!segments || segments.length === 0) {
    throw new Error("empty transcript");
  }

  const transcript = cleanTranscript(segments);
  if (transcript.length < 500) {
    throw new Error(`transcript suspiciously short (${transcript.length} chars)`);
  }

  const fileBody = `${buildFrontmatter(entry)}\n# ${entry.title}\n\n${transcript}\n`;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, `${entry.slug}.md`), fileBody, "utf8");

  return { slug: entry.slug, chars: transcript.length };
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
  if (ok === 0) process.exit(1);
}

main();
