import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Company, type Stage } from "./schema.js";

export interface Chunk {
  id: string;
  source: string;
  author: string;
  url: string;
  topics: string[];
  stage: (Stage | "all")[];
  text: string;
  vector: number[];
}

let cachedChunks: Chunk[] | null = null;
let cachedCompanies: Company[] | null = null;

export async function loadChunks(): Promise<Chunk[]> {
  if (cachedChunks) return cachedChunks;
  const path = join(process.cwd(), "content", "embeddings.json");
  const raw = await readFile(path, "utf8");
  cachedChunks = JSON.parse(raw) as Chunk[];
  return cachedChunks;
}

export async function loadCompanies(): Promise<Company[]> {
  if (cachedCompanies) return cachedCompanies;
  const path = join(process.cwd(), "content", "companies.json");
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  cachedCompanies = Company.array().parse(parsed);
  return cachedCompanies;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function voyageEmbedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: [text],
      model: "voyage-3",
      input_type: "query",
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embed ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

export async function retrieveForSection(
  sectionQuery: string,
  stage: Stage,
  k = 4,
): Promise<Chunk[]> {
  const chunks = await loadChunks();
  const queryVec = await voyageEmbedQuery(sectionQuery);
  return chunks
    .filter((c) => c.stage.includes(stage) || c.stage.includes("all"))
    .map((c) => ({ chunk: c, score: cosine(queryVec, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.chunk);
}

// Combine per-section retrievals, dedupe by chunk id, preserve first occurrence order.
export function dedupeChunks(lists: Chunk[][]): Chunk[] {
  const seen = new Set<string>();
  const out: Chunk[] = [];
  for (const list of lists) {
    for (const c of list) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    }
  }
  return out;
}

// Comparables retrieval: stage-filter + tag-overlap scoring. No embeddings.
// Falls back to ignoring stage filter if no records match the stage, since the
// hand-curated corpus is small (10 records) and a Squadova-shaped diagnosis
// might want to learn from a launched-stage failure even if the founder is at
// pre_launch.
export async function retrieveComparables(
  stage: Stage,
  tags: string[],
  k = 4,
): Promise<Company[]> {
  const companies = await loadCompanies();
  if (companies.length === 0) return [];

  const tagSet = new Set(tags.map((t) => t.toLowerCase()));

  const scored = companies.map((c) => {
    const overlap = c.tags.reduce(
      (acc, t) => acc + (tagSet.has(t.toLowerCase()) ? 1 : 0),
      0,
    );
    return { c, overlap };
  });

  // Two passes: prefer same-stage matches with overlap > 0, then expand if
  // the result set is too small.
  const targetStage = stage === "idea" || stage === "pre_launch" || stage === "launched"
    ? stage
    : "launched";

  const stageMatches = scored
    .filter((s) => s.c.stage === targetStage && s.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);

  if (stageMatches.length >= k) {
    return stageMatches.slice(0, k).map((s) => s.c);
  }

  const anyStageWithOverlap = scored
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);

  // Combine: same-stage first, then any-stage with overlap, dedupe.
  const seen = new Set<string>();
  const out: Company[] = [];
  for (const s of [...stageMatches, ...anyStageWithOverlap]) {
    if (!seen.has(s.c.id)) {
      seen.add(s.c.id);
      out.push(s.c);
      if (out.length === k) return out;
    }
  }

  // Final fallback: any record at the target stage, even with zero overlap.
  for (const s of scored) {
    if (s.c.stage === targetStage && !seen.has(s.c.id)) {
      seen.add(s.c.id);
      out.push(s.c);
      if (out.length === k) return out;
    }
  }
  return out;
}
