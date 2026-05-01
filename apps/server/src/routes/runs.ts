import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { db, runs, caseResults, llmTraces, eq, and, inArray, desc } from "@test-evals/db";
import { computePromptHash } from "@test-evals/llm";
import type { CaseScore, ClinicalExtraction, RunSummary, Strategy } from "@test-evals/shared";
import { startRun } from "../services/runner.service";
import { subscribe, unsubscribe } from "../lib/sse";
import { getDataset } from "../services/dataset";

const router = new Hono();

const CreateRunSchema = z.object({
  strategy: z.enum(["zero_shot", "few_shot", "cot"]),
  model: z.string().optional(),
  force: z.boolean().optional(),
});

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

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

function mapCaseResult(cr: typeof caseResults.$inferSelect, traces?: typeof llmTraces.$inferSelect[]) {
  return {
    id: cr.id,
    run_id: cr.runId,
    transcript_id: cr.transcriptId,
    status: cr.status as "pending" | "completed" | "failed",
    attempt_count: cr.attemptCount,
    schema_valid: cr.schemaValid,
    prediction: cr.prediction as ClinicalExtraction | null,
    scores: cr.scores as CaseScore | null,
    hallucination_count: cr.hallucinationCount,
    tokens_in: cr.tokensIn,
    tokens_out: cr.tokensOut,
    cache_read_tokens: cr.cacheReadTokens,
    cost_usd: cr.costUsd,
    created_at: cr.createdAt.toISOString(),
    traces: traces?.map((t) => ({
      id: t.id,
      case_result_id: t.caseResultId,
      attempt: t.attempt,
      request_payload: t.requestPayload,
      response_payload: t.responsePayload,
      cache_read_tokens: t.cacheReadTokens,
      created_at: t.createdAt.toISOString(),
    })),
  };
}

// POST /api/v1/runs — start a new run
router.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateRunSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const { strategy, model = DEFAULT_MODEL, force = false } = parsed.data;

  // Compute prompt hash (needs examples for few_shot)
  const dataset = await getDataset();
  const examples = strategy === "few_shot" ? dataset.slice(0, 2) : undefined;
  const promptHash = computePromptHash(strategy, model, examples);

  // Idempotency: return existing completed run unless force=true
  if (!force) {
    const existing = await db
      .select()
      .from(runs)
      .where(and(eq(runs.promptHash, promptHash), eq(runs.status, "completed")))
      .limit(1);
    if (existing.length > 0 && existing[0]) {
      return c.json(mapRun(existing[0]), 200);
    }
  }

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

  // Fire-and-forget
  void startRun(runId, strategy, model).catch(async (err) => {
    console.error(`Run ${runId} failed:`, err);
    await db.update(runs).set({ status: "failed" }).where(eq(runs.id, runId));
  });

  const runRow = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  const run = runRow[0];
  if (!run) return c.json({ error: "Failed to create run" }, 500);
  return c.json(mapRun(run), 201);
});

// GET /api/v1/runs — list all runs
router.get("/", async (c) => {
  const allRuns = await db.select().from(runs).orderBy(desc(runs.createdAt));
  return c.json(allRuns.map(mapRun));
});

// GET /api/v1/runs/:id — run detail with case results and traces
router.get("/:id", async (c) => {
  const id = c.req.param("id");
  const runRows = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  const run = runRows[0];
  if (!run) return c.json({ error: "Not found" }, 404);

  const cases = await db
    .select()
    .from(caseResults)
    .where(eq(caseResults.runId, id))
    .orderBy(caseResults.transcriptId);

  const caseIds = cases.map((cr) => cr.id);
  let tracesMap = new Map<string, typeof llmTraces.$inferSelect[]>();

  if (caseIds.length > 0) {
    const allTraces = await db
      .select()
      .from(llmTraces)
      .where(inArray(llmTraces.caseResultId, caseIds))
      .orderBy(llmTraces.caseResultId, llmTraces.attempt);

    for (const trace of allTraces) {
      const existing = tracesMap.get(trace.caseResultId) ?? [];
      existing.push(trace);
      tracesMap.set(trace.caseResultId, existing);
    }
  }

  return c.json({
    ...mapRun(run),
    case_results: cases.map((cr) => mapCaseResult(cr, tracesMap.get(cr.id))),
  });
});

// POST /api/v1/runs/:id/resume — resume an interrupted run
router.post("/:id/resume", async (c) => {
  const id = c.req.param("id");
  const runRows = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  const run = runRows[0];
  if (!run) return c.json({ error: "Not found" }, 404);
  if (run.status !== "interrupted" && run.status !== "failed") {
    return c.json({ error: `Cannot resume a run with status '${run.status}'` }, 409);
  }

  await db.update(runs).set({ status: "pending" }).where(eq(runs.id, id));

  void startRun(id, run.strategy as Strategy, run.model).catch(async (err) => {
    console.error(`Run ${id} resume failed:`, err);
    await db.update(runs).set({ status: "failed" }).where(eq(runs.id, id));
  });

  return c.json({ status: "resuming" }, 202);
});

// GET /api/v1/runs/:id/stream — SSE live progress
router.get("/:id/stream", (c) => {
  const runId = c.req.param("id");
  return streamSSE(c, async (stream) => {
    const client = { stream };
    subscribe(runId, client);

    const pingInterval = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "" }).catch(() => {});
    }, 15_000);

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        unsubscribe(runId, client);
        clearInterval(pingInterval);
        resolve();
      });
    });
  });
});

export default router;
