import matter from "gray-matter";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

type Stage = "idea" | "pre_launch" | "launched" | "revenue" | "growth" | "all";

interface Frontmatter {
  source: string;
  author: string;
  url: string;
  topics: string[];
  stage: Stage[];
}

interface Chunk {
  id: string;
  source: string;
  author: string;
  url: string;
  topics: string[];
  stage: Stage[];
  text: string;
  vector: number[];
}

const SOURCE_DIRS = ["content/pg-essays", "content/startup-school"];
const OUT_FILE = "content/embeddings.json";

// Target chunk size in characters. ~4 chars/token, so ~600 chars ≈ 150 tokens,
// ~2400 chars ≈ 600 tokens. We aim for the upper end so each chunk has enough
// context for retrieval without splitting mid-argument.
const TARGET_CHARS = 2400;
const MIN_CHARS = 400;

const VOYAGE_MODEL = "voyage-3";
const VOYAGE_BATCH = 96; // Voyage allows 128; leave headroom.

function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[\]\(spacer\.gif\)/g, "") // PG layout artefact
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")  // any other images
    .replace(/[ \t]+\n/g, "\n")            // strip trailing whitespace from <br> conversions
    .replace(/\n{3,}/g, "\n\n")            // collapse runs of blank lines
    .trim();
}

// Group paragraphs (split on blank lines) into chunks of roughly TARGET_CHARS.
// Doesn't split paragraphs — if one is huge, it becomes its own chunk.
function chunkBody(body: string): string[] {
  const paragraphs = cleanMarkdown(body)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let buf: string[] = [];
  let bufLen = 0;

  for (const p of paragraphs) {
    if (bufLen + p.length > TARGET_CHARS && bufLen >= MIN_CHARS) {
      chunks.push(buf.join("\n\n"));
      buf = [p];
      bufLen = p.length;
    } else {
      buf.push(p);
      bufLen += p.length + 2;
    }
  }
  if (buf.length > 0) chunks.push(buf.join("\n\n"));

  return chunks.filter((c) => c.length >= MIN_CHARS);
}

async function loadFile(path: string): Promise<{ slug: string; fm: Frontmatter; body: string }> {
  const raw = await readFile(path, "utf8");
  const parsed = matter(raw);
  const slug = basename(path, ".md");
  return { slug, fm: parsed.data as Frontmatter, body: parsed.content };
}

async function loadAllFiles(): Promise<Awaited<ReturnType<typeof loadFile>>[]> {
  const out: Awaited<ReturnType<typeof loadFile>>[] = [];
  for (const dir of SOURCE_DIRS) {
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      out.push(await loadFile(join(dir, entry)));
    }
  }
  return out;
}

async function voyageEmbed(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: "document",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Voyage API ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  // Voyage returns ordered by index; sort defensively.
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function main() {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    console.error("VOYAGE_API_KEY is not set. Add it to .env.local and re-run.");
    process.exit(1);
  }

  console.log("Loading markdown files...");
  const files = await loadAllFiles();
  console.log(`Loaded ${files.length} files.`);

  // Build chunk metadata first (no vectors yet).
  const pending: Omit<Chunk, "vector">[] = [];
  for (const { slug, fm, body } of files) {
    const pieces = chunkBody(body);
    pieces.forEach((text, i) => {
      pending.push({
        id: `${slug}-${i}`,
        source: fm.source,
        author: fm.author,
        url: fm.url,
        topics: fm.topics ?? [],
        stage: fm.stage ?? [],
        text,
      });
    });
  }
  console.log(`Built ${pending.length} chunks. Embedding in batches of ${VOYAGE_BATCH}...`);

  const out: Chunk[] = [];
  for (let i = 0; i < pending.length; i += VOYAGE_BATCH) {
    const batch = pending.slice(i, i + VOYAGE_BATCH);
    const vectors = await voyageEmbed(batch.map((c) => c.text), apiKey);
    batch.forEach((c, j) => out.push({ ...c, vector: vectors[j] }));
    console.log(`  embedded ${out.length} / ${pending.length}`);
  }

  await writeFile(OUT_FILE, JSON.stringify(out), "utf8");

  const dim = out[0]?.vector.length ?? 0;
  const sources = new Set(out.map((c) => c.source)).size;
  console.log(
    `\nDone. ${out.length} chunks across ${sources} sources, dim=${dim}, written to ${OUT_FILE}`,
  );
}

main();
