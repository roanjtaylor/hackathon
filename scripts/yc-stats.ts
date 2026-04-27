// Quick cohort stats over content/yc_companies.json. Prints:
//   - overall status breakdown
//   - per-batch outcomes (only "mature" batches, age >= 5y)
//   - inactive% as a function of cohort age
//
// "Inactive" in YC's directory means dead, pivoted away, or shut down
// (it's the closest public proxy for "the startup didn't make it"). Acquired
// and Public are wins. Active is alive but unproven for newer batches.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

interface Company {
  id: number;
  name: string;
  batch: string;
  status: string;
  top_company: boolean;
  tags: string[];
  industry: string;
}

const NOW_YEAR = new Date().getUTCFullYear();

function batchYear(batch: string): number | null {
  // "Winter 2022", "Summer 2021", "Spring 2025", "Fall 2024", "Unspecified"
  const m = batch.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

async function main() {
  const path = join(process.cwd(), "content", "yc_companies.json");
  const all = JSON.parse(await readFile(path, "utf8")) as Company[];

  // ---- overall ----
  const overall = new Map<string, number>();
  for (const c of all) overall.set(c.status, (overall.get(c.status) ?? 0) + 1);
  console.log(`Total companies: ${all.length}`);
  for (const [k, v] of [...overall.entries()].sort((a, b) => b[1] - a[1])) {
    const pct = ((v / all.length) * 100).toFixed(1);
    console.log(`  ${k.padEnd(10)} ${String(v).padStart(5)}  ${pct}%`);
  }

  // ---- per-batch (sorted chronologically) ----
  const byBatch = new Map<string, Company[]>();
  for (const c of all) {
    if (!byBatch.has(c.batch)) byBatch.set(c.batch, []);
    byBatch.get(c.batch)!.push(c);
  }

  const seasonOrder: Record<string, number> = { Winter: 1, Spring: 2, Summer: 3, Fall: 4 };
  const sortedBatches = [...byBatch.keys()]
    .filter((b) => batchYear(b) !== null)
    .sort((a, b) => {
      const ya = batchYear(a)!;
      const yb = batchYear(b)!;
      if (ya !== yb) return ya - yb;
      const sa = a.split(" ")[0];
      const sb = b.split(" ")[0];
      return (seasonOrder[sa] ?? 0) - (seasonOrder[sb] ?? 0);
    });

  console.log("\nPer-batch outcomes (oldest first):");
  console.log("  batch            n   active  inactive  acquired  public  top%");
  for (const batch of sortedBatches) {
    const cs = byBatch.get(batch)!;
    const c = (s: string) => cs.filter((x) => x.status === s).length;
    const top = cs.filter((x) => x.top_company).length;
    console.log(
      `  ${batch.padEnd(15)} ${String(cs.length).padStart(3)}` +
        `  ${String(c("Active")).padStart(6)}` +
        `  ${String(c("Inactive")).padStart(8)}` +
        `  ${String(c("Acquired")).padStart(8)}` +
        `  ${String(c("Public")).padStart(6)}` +
        `  ${((top / cs.length) * 100).toFixed(1).padStart(4)}%`,
    );
  }

  // ---- mature-cohort failure-rate trend ----
  // Compare like-for-like: only batches old enough that startup death has had
  // time to play out. Default = 5y.
  const MATURE_AGE = 5;
  console.log(`\nMature cohorts only (batch year <= ${NOW_YEAR - MATURE_AGE}):`);
  console.log("  year   n     inactive%   acquired+public%   top%");
  const yearAgg = new Map<number, Company[]>();
  for (const c of all) {
    const y = batchYear(c.batch);
    if (y === null) continue;
    if (NOW_YEAR - y < MATURE_AGE) continue;
    if (!yearAgg.has(y)) yearAgg.set(y, []);
    yearAgg.get(y)!.push(c);
  }
  for (const y of [...yearAgg.keys()].sort()) {
    const cs = yearAgg.get(y)!;
    const inactive = cs.filter((x) => x.status === "Inactive").length;
    const wins = cs.filter((x) => x.status === "Acquired" || x.status === "Public").length;
    const top = cs.filter((x) => x.top_company).length;
    console.log(
      `  ${y}  ${String(cs.length).padStart(4)}  ${((inactive / cs.length) * 100).toFixed(1).padStart(6)}%` +
        `        ${((wins / cs.length) * 100).toFixed(1).padStart(5)}%` +
        `      ${((top / cs.length) * 100).toFixed(1).padStart(4)}%`,
    );
  }

  // ---- top tags ----
  const tagAgg = new Map<string, number>();
  for (const c of all) for (const t of c.tags) tagAgg.set(t, (tagAgg.get(t) ?? 0) + 1);
  console.log("\nTop 20 tags:");
  for (const [t, n] of [...tagAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${t.padEnd(28)} ${n}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
