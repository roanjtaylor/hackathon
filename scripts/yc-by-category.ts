// Cohort outcomes by category tag, mature batches only (≥5y old).
// Tests the "marketplaces beat SaaS in the long run" thesis empirically.
import { readFile } from "node:fs/promises";

interface C {
  batch: string;
  status: string;
  tags: string[];
  industry: string;
  top_company: boolean;
}

const NOW = new Date().getUTCFullYear();
const MATURE = 5;

function batchYear(b: string): number | null {
  const m = b.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

const all = JSON.parse(await readFile("content/yc_companies.json", "utf8")) as C[];
const mature = all.filter((c) => {
  const y = batchYear(c.batch);
  return y !== null && NOW - y >= MATURE;
});

const CATEGORIES: { name: string; match: (c: C) => boolean }[] = [
  { name: "Marketplace", match: (c) => c.tags.includes("Marketplace") },
  { name: "SaaS (any)", match: (c) => c.tags.includes("SaaS") },
  { name: "SaaS B2B (no marketplace)", match: (c) => c.tags.includes("SaaS") && c.tags.includes("B2B") && !c.tags.includes("Marketplace") },
  { name: "Developer Tools", match: (c) => c.tags.includes("Developer Tools") },
  { name: "Fintech", match: (c) => c.tags.includes("Fintech") },
  { name: "Consumer (no marketplace)", match: (c) => c.tags.includes("Consumer") && !c.tags.includes("Marketplace") },
  { name: "Healthcare/Health Tech", match: (c) => c.tags.includes("Healthcare") || c.tags.includes("Health Tech") },
  { name: "AI / ML / GenAI", match: (c) => c.tags.some((t) => /^(AI|Artificial Intelligence|Generative AI|Machine Learning)$/.test(t)) },
  { name: "Open Source", match: (c) => c.tags.includes("Open Source") },
  { name: "E-commerce", match: (c) => c.tags.includes("E-commerce") },
  { name: "Hardware", match: (c) => c.tags.includes("Hardware") },
];

console.log(`Mature cohort (batch year ≤ ${NOW - MATURE}): n=${mature.length}\n`);
console.log("category".padEnd(28) + "n".padStart(5) + "  died%   exited%   top%");
for (const cat of CATEGORIES) {
  const cs = mature.filter(cat.match);
  if (cs.length < 20) continue;
  const dead = cs.filter((c) => c.status === "Inactive").length;
  const exit = cs.filter((c) => c.status === "Acquired" || c.status === "Public").length;
  const top = cs.filter((c) => c.top_company).length;
  console.log(
    cat.name.padEnd(28) +
      String(cs.length).padStart(5) +
      "  " + ((dead / cs.length) * 100).toFixed(1).padStart(5) + "%" +
      "    " + ((exit / cs.length) * 100).toFixed(1).padStart(5) + "%" +
      "    " + ((top / cs.length) * 100).toFixed(1).padStart(4) + "%",
  );
}
