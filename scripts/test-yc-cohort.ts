// Standalone smoke-test for the YC cohort retrieval — no Anthropic call.
import { retrieveYcCohort } from "../src/lib/retrieval.js";
import { buildYcCohortBlock } from "../src/lib/prompts.js";

const c = await retrieveYcCohort(
  "A Belfast-based marketplace that helps casual football players find a local pickup match this week.",
  ["marketplace", "two-sided", "cold-start", "warm-network", "switching-cost", "consumer"],
  "two-sided local marketplace, B2C",
);
console.log(buildYcCohortBlock(c));
console.log("\n--- raw cohort meta ---");
console.log("query_terms:", c.query_terms);
console.log("mature_only:", c.mature_only);
console.log("stats:", c.stats);
