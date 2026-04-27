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

// One YC company directory record (subset of fields scraped by
// scripts/scrape-yc-companies.ts). Used for quantitative cohort context.
export interface YcCompany {
  id: number;
  name: string;
  slug: string;
  website: string;
  all_locations: string;
  one_liner: string;
  long_description: string;
  team_size: number | null;
  industry: string;
  subindustry: string;
  industries: string[];
  regions: string[];
  tags: string[];
  batch: string;
  status: string;
  stage: string;
  top_company: boolean;
  isHiring: boolean;
  nonprofit: boolean;
  launched_at: number | null;
}

export interface YcCohortStats {
  n: number;
  active: number;
  inactive: number;
  acquired: number;
  public: number;
  top_company: number;
  // Same counts as percentages of n, rounded to integer.
  pct: { active: number; inactive: number; acquired: number; public: number; top_company: number };
}

export interface YcCohort {
  query_terms: string[];
  mature_only: boolean;
  stats: YcCohortStats;
  representatives: YcCompany[];
}

let cachedChunks: Chunk[] | null = null;
let cachedCompanies: Company[] | null = null;
let cachedYc: YcCompany[] | null = null;

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

// ---------------------------------------------------------------------------
// YC cohort retrieval — quantitative outcomes from the full directory.
// ---------------------------------------------------------------------------

export async function loadYcCompanies(): Promise<YcCompany[]> {
  if (cachedYc) return cachedYc;
  const path = join(process.cwd(), "content", "yc_companies.json");
  const raw = await readFile(path, "utf8");
  cachedYc = JSON.parse(raw) as YcCompany[];
  return cachedYc;
}

// Diagnosis retrieval_tags are kebab-case PG-doctrine terms (e.g. "marketplace",
// "two-sided", "switching-cost"). The YC directory uses human-readable industry
// tags ("Marketplace", "SaaS", "Developer Tools"). This map bridges the two so
// we can find sector-relevant cohorts. Keys are lowercased; values are case-
// insensitively matched against c.tags ∪ industry ∪ subindustry ∪ industries.
const DIAG_TAG_TO_YC: Record<string, string[]> = {
  marketplace: ["marketplace"],
  "two-sided": ["marketplace"],
  "supply-side": ["marketplace"],
  "cold-start": ["marketplace", "consumer"],
  saas: ["saas", "b2b"],
  b2b: ["b2b", "saas"],
  consumer: ["consumer"],
  fintech: ["fintech", "payments"],
  payments: ["payments", "fintech"],
  health: ["healthcare", "health tech"],
  healthcare: ["healthcare", "health tech"],
  education: ["education"],
  edtech: ["education"],
  ecommerce: ["e-commerce"],
  "e-commerce": ["e-commerce"],
  ai: ["ai", "artificial intelligence", "generative ai", "machine learning"],
  "artificial-intelligence": ["ai", "artificial intelligence", "generative ai"],
  ml: ["machine learning", "ai"],
  "developer-tools": ["developer tools"],
  devtools: ["developer tools"],
  "open-source": ["open source"],
  productivity: ["productivity"],
  analytics: ["analytics"],
  climate: ["climate"],
};

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "to", "of", "in", "on", "at",
  "is", "are", "be", "by", "as", "it", "its", "this", "that", "we", "you",
  "your", "our", "from", "into", "via", "using", "use", "users", "user",
  "make", "build", "company", "startup", "platform", "tool", "tools", "app",
  "software", "service", "solution",
]);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Build a deduped keyword set from the founder's one-liner plus the diagnosis
// retrieval_tags and company_shape. We expand kebab-case diagnosis tags via
// DIAG_TAG_TO_YC so PG-doctrine terms map onto YC industry vocabulary.
export function buildCohortQueryTerms(
  oneLiner: string,
  retrievalTags: string[],
  companyShape: string,
): string[] {
  const terms = new Set<string>();
  for (const t of retrievalTags) {
    const k = t.toLowerCase();
    const mapped = DIAG_TAG_TO_YC[k];
    if (mapped) {
      for (const m of mapped) terms.add(m);
    } else {
      terms.add(k.replace(/-/g, " "));
    }
  }
  for (const phrase of [oneLiner, companyShape]) {
    for (const w of normalize(phrase).split(" ")) {
      if (w.length >= 4 && !STOPWORDS.has(w)) terms.add(w);
    }
  }
  return [...terms];
}

function scoreYcCompany(c: YcCompany, terms: string[]): number {
  const haystack = [
    ...c.tags,
    c.industry,
    c.subindustry,
    ...c.industries,
  ]
    .filter(Boolean)
    .map((s) => s.toLowerCase())
    .join(" | ");
  let score = 0;
  for (const t of terms) {
    if (!t) continue;
    if (haystack.includes(t)) score += 2; // tag/industry hit — strong
    else if (c.one_liner && c.one_liner.toLowerCase().includes(t)) score += 1; // weak
  }
  return score;
}

function batchYear(batch: string): number | null {
  const m = batch.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

function summarize(cohort: YcCompany[]): YcCohortStats {
  const c = (s: string) => cohort.filter((x) => x.status === s).length;
  const active = c("Active");
  const inactive = c("Inactive");
  const acquired = c("Acquired");
  const publicCo = c("Public");
  const top = cohort.filter((x) => x.top_company).length;
  return {
    n: cohort.length,
    active,
    inactive,
    acquired,
    public: publicCo,
    top_company: top,
    pct: {
      active: pct(active, cohort.length),
      inactive: pct(inactive, cohort.length),
      acquired: pct(acquired, cohort.length),
      public: pct(publicCo, cohort.length),
      top_company: pct(top, cohort.length),
    },
  };
}

// Retrieve a YC cohort matching the founder's diagnosis. We compute stats on
// MATURE batches (≥5y old) so survivorship bias doesn't make every cohort look
// healthy — newer batches haven't had time to fail. Representatives can come
// from any batch so the founder sees both outcomes and current peers.
export async function retrieveYcCohort(
  oneLiner: string,
  retrievalTags: string[],
  companyShape: string,
  matureCutoffYears = 5,
  repCount = 8,
): Promise<YcCohort> {
  const all = await loadYcCompanies();
  const terms = buildCohortQueryTerms(oneLiner, retrievalTags, companyShape);

  const scored = all
    .map((c) => ({ c, score: scoreYcCompany(c, terms) }))
    .filter((s) => s.score > 0);

  const nowYear = new Date().getUTCFullYear();
  const matureScored = scored.filter((s) => {
    const y = batchYear(s.c.batch);
    return y !== null && nowYear - y >= matureCutoffYears;
  });

  // Stats: prefer the mature subset for fair survival numbers, but if the
  // matched cohort is too thin (newer-only sector like Generative AI), fall
  // back to all matches and flag it.
  const useMature = matureScored.length >= 30;
  const statsCohort = (useMature ? matureScored : scored).map((s) => s.c);

  // Reps: top by score, with a slight boost for top_company and known exits
  // so the founder sees notable peers, not random.
  const repsRanked = [...scored].sort((a, b) => {
    const aBoost = (a.c.top_company ? 1 : 0) + (a.c.status === "Public" ? 1 : 0) + (a.c.status === "Acquired" ? 0.5 : 0);
    const bBoost = (b.c.top_company ? 1 : 0) + (b.c.status === "Public" ? 1 : 0) + (b.c.status === "Acquired" ? 0.5 : 0);
    return b.score + bBoost - (a.score + aBoost);
  });
  // Diversity: at least one Inactive in reps if any matched, so the founder
  // sees a real death from their own sector — not a survivorship reel.
  const reps: YcCompany[] = [];
  const seen = new Set<number>();
  for (const s of repsRanked) {
    if (reps.length >= repCount) break;
    if (seen.has(s.c.id)) continue;
    seen.add(s.c.id);
    reps.push(s.c);
  }
  const hasInactive = reps.some((r) => r.status === "Inactive");
  if (!hasInactive) {
    const firstInactive = repsRanked.find((s) => s.c.status === "Inactive" && !seen.has(s.c.id));
    if (firstInactive) {
      reps[reps.length - 1] = firstInactive.c; // swap weakest rep for a death
    }
  }

  return {
    query_terms: terms,
    mature_only: useMature,
    stats: summarize(statsCohort),
    representatives: reps,
  };
}
