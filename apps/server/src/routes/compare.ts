import { Hono } from "hono";
import { db, runs, caseResults, eq } from "@test-evals/db";
import type { CaseScore, CompareResponse, FieldDelta, RunSummary, Strategy } from "@test-evals/shared";

const router = new Hono();

function mapRun(run: typeof runs.$inferSelect): RunSummary {
  return {
    id: run.id,
    strategy: run.strategy as Strategy,
    model: run.model,
    status: run.status as RunSummary["status"],
    prompt_hash: run.promptHash,
    started_at: run.startedAt?.toISOString() ?? null,
    completed_at: run.completedAt?.toISOString() ?? null,
    total_cases_count: run.totalCasesCount,
    completed_cases_count: run.completedCasesCount,
    tokens_in: run.tokensIn,
    tokens_out: run.tokensOut,
    cache_read_tokens: run.cacheReadTokens,
    cache_write_tokens: run.cacheWriteTokens,
    cost_usd: run.costUsd,
    duration_ms: run.durationMs,
    created_at: run.createdAt.toISOString(),
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeFieldScores(cases: typeof caseResults.$inferSelect[]): Record<string, number> {
  const completed = cases.filter((c) => c.status === "completed" && c.scores);

  const getScores = <K extends keyof CaseScore>(field: K, extract: (s: CaseScore) => number): number => {
    const vals = completed
      .map((c) => {
        const s = c.scores as CaseScore | null;
        if (!s) return null;
        try {
          return extract(s);
        } catch {
          return null;
        }
      })
      .filter((v): v is number => v !== null);
    return mean(vals);
  };

  return {
    chief_complaint: getScores("chief_complaint", (s) => s.chief_complaint.ratio),
    vitals: getScores("vitals", (s) => s.vitals.aggregate),
    medications_f1: getScores("medications", (s) => s.medications.f1),
    diagnoses_f1: getScores("diagnoses", (s) => s.diagnoses.f1),
    plan_f1: getScores("plan", (s) => s.plan.f1),
    follow_up: getScores("follow_up", (s) => {
      const fu = s.follow_up;
      const parts: number[] = [];
      if (fu.interval_days_exact !== null) parts.push(fu.interval_days_exact ? 1 : 0);
      if (fu.reason_ratio !== null) parts.push(fu.reason_ratio);
      return parts.length === 0 ? 1 : mean(parts);
    }),
    hallucination_count: mean(
      completed
        .map((c) => (c.scores as CaseScore | null)?.hallucination_count ?? null)
        .filter((v): v is number => v !== null),
    ),
    aggregate_f1: getScores("aggregate_f1", (s) => s.aggregate_f1),
    schema_failures: mean(
      completed.map((c) => (c.schemaValid ? 0 : 1)),
    ),
  };
}

// GET /api/v1/compare?a=runId1&b=runId2
router.get("/", async (c) => {
  const runAId = c.req.query("a");
  const runBId = c.req.query("b");

  if (!runAId || !runBId) {
    return c.json({ error: "Query params 'a' and 'b' are required" }, 400);
  }

  const [runARows, runBRows] = await Promise.all([
    db.select().from(runs).where(eq(runs.id, runAId)).limit(1),
    db.select().from(runs).where(eq(runs.id, runBId)).limit(1),
  ]);

  const runA = runARows[0];
  const runB = runBRows[0];
  if (!runA || !runB) return c.json({ error: "One or both runs not found" }, 404);

  const [casesA, casesB] = await Promise.all([
    db.select().from(caseResults).where(eq(caseResults.runId, runAId)),
    db.select().from(caseResults).where(eq(caseResults.runId, runBId)),
  ]);

  const scoresA = computeFieldScores(casesA);
  const scoresB = computeFieldScores(casesB);

  const fields = [
    "chief_complaint",
    "vitals",
    "medications_f1",
    "diagnoses_f1",
    "plan_f1",
    "follow_up",
    "aggregate_f1",
    "hallucination_count",
    "schema_failures",
  ];

  // For hallucination/schema fields: lower is better → invert winner logic
  const lowerIsBetter = new Set(["hallucination_count", "schema_failures"]);

  const field_deltas: FieldDelta[] = fields.map((field) => {
    const scoreA = scoresA[field] ?? 0;
    const scoreB = scoresB[field] ?? 0;
    const delta = scoreA - scoreB;
    const threshold = 0.01;
    let winner: "a" | "b" | "tie";
    if (lowerIsBetter.has(field)) {
      winner = delta < -threshold ? "a" : delta > threshold ? "b" : "tie";
    } else {
      winner = delta > threshold ? "a" : delta < -threshold ? "b" : "tie";
    }
    return { field, score_a: scoreA, score_b: scoreB, delta, winner };
  });

  const response: CompareResponse = {
    run_a: mapRun(runA),
    run_b: mapRun(runB),
    field_deltas,
  };

  return c.json(response);
});

export default router;
