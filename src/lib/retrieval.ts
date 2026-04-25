import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Stage } from "./schema.js";

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

let cached: Chunk[] | null = null;

export async function loadChunks(): Promise<Chunk[]> {
  if (cached) return cached;
  const path = join(process.cwd(), "content", "embeddings.json");
  const raw = await readFile(path, "utf8");
  cached = JSON.parse(raw) as Chunk[];
  return cached;
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
