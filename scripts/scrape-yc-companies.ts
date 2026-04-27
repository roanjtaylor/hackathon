// Scrape the full YC company directory via the public Algolia index that
// powers ycombinator.com/companies. Writes content/yc_companies.json.
//
// The app id and API key are extracted from the public site (window.AlgoliaOpts)
// and are intended for browser use, so this is just hitting the same endpoint
// the directory page hits. ~5,800 records, fetched in pages of 1000.

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const ALGOLIA_APP = "45BWZJ1SGC";
const ALGOLIA_KEY =
  "NzllNTY5MzJiZGM2OTY2ZTQwMDEzOTNhYWZiZGRjODlhYzVkNjBmOGRjNzJiMWM4ZTU0ZDlhYTZjOTJiMjlhMWFuYWx5dGljc1RhZ3M9eWNkYyZyZXN0cmljdEluZGljZXM9WUNDb21wYW55X3Byb2R1Y3Rpb24lMkNZQ0NvbXBhbnlfQnlfTGF1bmNoX0RhdGVfcHJvZHVjdGlvbiZ0YWdGaWx0ZXJzPSU1QiUyMnljZGNfcHVibGljJTIyJTVE";
const INDEX = "YCCompany_production";
const PAGE_SIZE = 1000;
const OUTPUT = join(process.cwd(), "content", "yc_companies.json");

interface RawHit {
  id: number;
  name: string;
  slug: string;
  former_names: string[];
  website: string;
  all_locations: string;
  long_description: string;
  one_liner: string;
  team_size: number | null;
  industry: string;
  subindustry: string;
  launched_at: number | null;
  tags: string[];
  top_company: boolean;
  isHiring: boolean;
  nonprofit: boolean;
  batch: string;
  status: "Active" | "Acquired" | "Public" | "Inactive" | string;
  industries: string[];
  regions: string[];
  stage: string;
  // ...plus _highlightResult and other fields we drop
  [k: string]: unknown;
}

interface CleanCompany {
  id: number;
  name: string;
  slug: string;
  former_names: string[];
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

function clean(h: RawHit): CleanCompany {
  return {
    id: h.id,
    name: h.name,
    slug: h.slug,
    former_names: h.former_names ?? [],
    website: h.website ?? "",
    all_locations: h.all_locations ?? "",
    one_liner: h.one_liner ?? "",
    long_description: h.long_description ?? "",
    team_size: h.team_size ?? null,
    industry: h.industry ?? "",
    subindustry: h.subindustry ?? "",
    industries: h.industries ?? [],
    regions: h.regions ?? [],
    tags: h.tags ?? [],
    batch: h.batch ?? "",
    status: h.status ?? "",
    stage: h.stage ?? "",
    top_company: !!h.top_company,
    isHiring: !!h.isHiring,
    nonprofit: !!h.nonprofit,
    launched_at: h.launched_at ?? null,
  };
}

async function algoliaPost(params: string): Promise<{ hits: RawHit[]; nbHits: number; facets?: Record<string, Record<string, number>> }> {
  const body = { requests: [{ indexName: INDEX, params }] };
  const res = await fetch(
    `https://${ALGOLIA_APP}-dsn.algolia.net/1/indexes/*/queries`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-API-Key": ALGOLIA_KEY,
        "X-Algolia-Application-Id": ALGOLIA_APP,
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`Algolia ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { results: { hits: RawHit[]; nbHits: number; facets?: Record<string, Record<string, number>> }[] };
  return json.results[0];
}

async function listBatches(): Promise<string[]> {
  // Algolia caps a single search response at 1000 hits. We slice the corpus
  // by batch — every YC batch is well under 1000 — and union the results.
  const r = await algoliaPost("hitsPerPage=0&facets=%5B%22batch%22%5D&maxValuesPerFacet=200");
  const facet = r.facets?.batch ?? {};
  return Object.keys(facet);
}

async function fetchBatch(batch: string): Promise<RawHit[]> {
  const facetFilters = encodeURIComponent(JSON.stringify([[`batch:${batch}`]]));
  const out: RawHit[] = [];
  let page = 0;
  while (true) {
    const r = await algoliaPost(`hitsPerPage=${PAGE_SIZE}&page=${page}&facetFilters=${facetFilters}`);
    out.push(...r.hits);
    if (out.length >= r.nbHits || r.hits.length === 0) break;
    page += 1;
  }
  return out;
}

async function main() {
  console.log("Listing YC batches…");
  const batches = await listBatches();
  console.log(`Found ${batches.length} batches.`);

  const all: CleanCompany[] = [];
  const seen = new Set<number>();
  for (const batch of batches) {
    const hits = await fetchBatch(batch);
    let added = 0;
    for (const h of hits) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      all.push(clean(h));
      added += 1;
    }
    console.log(`  ${batch.padEnd(15)} +${added} (total ${all.length})`);
  }

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(all, null, 2), "utf8");
  console.log(`Wrote ${all.length} companies to ${OUTPUT}`);

  // Quick summary so we can sanity-check the data immediately.
  const byStatus = new Map<string, number>();
  const byBatch = new Map<string, number>();
  for (const c of all) {
    byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
    byBatch.set(c.batch, (byBatch.get(c.batch) ?? 0) + 1);
  }
  console.log("\nStatus breakdown:");
  for (const [k, v] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(10)} ${v}`);
  }
  console.log(`\nBatches covered: ${byBatch.size}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
