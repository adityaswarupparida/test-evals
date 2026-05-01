import { parseArgs } from "node:util";
import { eq } from "@test-evals/db";
import { db, runs, caseResults } from "@test-evals/db";
import { computePromptHash } from "@test-evals/llm";
import type { CaseScore, Strategy } from "@test-evals/shared";
import { startRun } from "../services/runner.service";
import { getDataset } from "../services/dataset";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    strategy: { type: "string" },
    model: { type: "string" },
  },
  allowPositionals: true,
});

const strategy = (values.strategy ?? "zero_shot") as Strategy;
const model = values.model ?? "claude-haiku-4-5-20251001";

const VALID_STRATEGIES: Strategy[] = ["zero_shot", "few_shot", "cot"];
if (!VALID_STRATEGIES.includes(strategy)) {
  console.error(`Invalid strategy "${strategy}". Must be one of: ${VALID_STRATEGIES.join(", ")}`);
  process.exit(1);
}

console.log(`\nHEALOSBENCH — strategy=${strategy}  model=${model}\n`);

const dataset = await getDataset();
const examples = strategy === "few_shot" ? dataset.slice(0, 2) : undefined;
const promptHash = computePromptHash(strategy, model, examples);

const runId = crypto.randomUUID();
await db.insert(runs).values({
  id: runId,
  strategy,
  model,
  status: "pending",
  promptHash,
  totalCasesCount: 0,
  completedCasesCount: 0,
});

const t0 = Date.now();
console.log(`Run ID: ${runId}  Prompt hash: ${promptHash}\n`);

await startRun(runId, strategy, model);

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nCompleted in ${elapsed}s\n`);

// Query results
const run = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
const cases = await db
  .select()
  .from(caseResults)
  .where(eq(caseResults.runId, runId))
  .orderBy(caseResults.transcriptId);

const runRow = run[0];
if (!runRow) {
  console.error("Run not found");
  process.exit(1);
}

// Print per-case summary
const tableData = cases.map((cr) => {
  const scores = cr.scores as CaseScore | null;
  return {
    case: cr.transcriptId,
    status: cr.status,
    attempts: cr.attemptCount,
    schema_ok: cr.schemaValid ? "✓" : "✗",
    agg_f1: scores ? scores.aggregate_f1.toFixed(3) : "—",
    med_f1: scores ? scores.medications.f1.toFixed(3) : "—",
    dx_f1: scores ? scores.diagnoses.f1.toFixed(3) : "—",
    hallucs: cr.hallucinationCount,
    cost_usd: cr.costUsd.toFixed(4),
  };
});

console.table(tableData);

// Print run summary
const completedCases = cases.filter((c) => c.status === "completed" && c.scores);
const scores = completedCases.map((c) => (c.scores as CaseScore).aggregate_f1);
const meanF1 = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
const schemaFailures = cases.filter((c) => c.status === "completed" && !c.schemaValid).length;

console.log("\n─── Run Summary ─────────────────────────────────");
console.log(`  Strategy:        ${strategy}`);
console.log(`  Model:           ${model}`);
console.log(`  Prompt hash:     ${promptHash}`);
console.log(`  Cases evaluated: ${cases.length}`);
console.log(`  Mean agg F1:     ${meanF1.toFixed(4)}`);
console.log(`  Schema failures: ${schemaFailures}`);
console.log(`  Tokens in:       ${runRow.tokensIn.toLocaleString()}`);
console.log(`  Tokens out:      ${runRow.tokensOut.toLocaleString()}`);
console.log(`  Cache reads:     ${runRow.cacheReadTokens.toLocaleString()}`);
console.log(`  Total cost:      $${runRow.costUsd.toFixed(4)}`);
console.log(`  Duration:        ${elapsed}s`);
console.log("─────────────────────────────────────────────────\n");
