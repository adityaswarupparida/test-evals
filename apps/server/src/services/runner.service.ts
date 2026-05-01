import { eq, and, inArray, sql } from "@test-evals/db";
import { db, runs, caseResults, llmTraces } from "@test-evals/db";
import { Semaphore } from "@test-evals/llm";
import type { CaseScore, DatasetItem, SseEvent, Strategy } from "@test-evals/shared";
import { getDataset } from "./dataset";
import { extractFromTranscript } from "./extract.service";
import type { ExtractionResult } from "./extract.service";
import { evaluateCase } from "./evaluate.service";
import { emit } from "../lib/sse";

type Db = typeof db;

function newId(): string {
  return crypto.randomUUID();
}

function mapToSummary(run: typeof runs.$inferSelect) {
  return {
    id: run.id,
    strategy: run.strategy as Strategy,
    model: run.model,
    status: run.status as "pending" | "running" | "completed" | "failed" | "interrupted",
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

async function processCase(
  item: DatasetItem,
  runId: string,
  caseResultId: string,
  strategy: Strategy,
  model: string,
  database: Db,
  examples?: DatasetItem[],
  extractFn?: typeof extractFromTranscript,
): Promise<ExtractionResult | null> {
  const doExtract = extractFn ?? extractFromTranscript;

  try {
    const result = await doExtract(item.transcript, strategy, model, examples);
    const scores = result.prediction
      ? evaluateCase(result.prediction, item.gold, item.transcript)
      : null;

    // Insert traces
    for (const trace of result.traces) {
      await database.insert(llmTraces).values({
        id: newId(),
        caseResultId,
        attempt: trace.attempt,
        requestPayload: { messages: trace.requestMessages } as Record<string, unknown>,
        responsePayload: { content: trace.responseContent, schema_valid: trace.schemaValid } as Record<string, unknown>,
        cacheReadTokens: trace.tokenStats.cacheReadTokens,
      });
    }

    // Update case result
    await database
      .update(caseResults)
      .set({
        status: "completed",
        attemptCount: result.traces.length,
        schemaValid: result.schemaValid,
        prediction: result.prediction as Record<string, unknown> | null,
        scores: scores as Record<string, unknown> | null,
        hallucinationCount: scores?.hallucination_count ?? 0,
        tokensIn: result.tokenStats.inputTokens,
        tokensOut: result.tokenStats.outputTokens,
        cacheReadTokens: result.tokenStats.cacheReadTokens,
        costUsd: result.costUsd,
      })
      .where(eq(caseResults.id, caseResultId));

    return result;
  } catch (err) {
    await database
      .update(caseResults)
      .set({ status: "failed" })
      .where(eq(caseResults.id, caseResultId));
    console.error(`Case ${item.id} failed:`, err);
    return null;
  }
}

export async function startRun(
  runId: string,
  strategy: Strategy,
  model: string,
  database: Db = db,
  extractFn?: typeof extractFromTranscript,
): Promise<void> {
  const dataset = await getDataset();

  // For few_shot: first 2 items are examples (excluded from eval)
  const examples = strategy === "few_shot" ? dataset.slice(0, 2) : undefined;
  const evalItems = strategy === "few_shot" ? dataset.slice(2) : dataset;
  const totalCases = evalItems.length;

  const startedAt = new Date();
  await database
    .update(runs)
    .set({ status: "running", startedAt, totalCasesCount: totalCases })
    .where(eq(runs.id, runId));

  // Find already-completed case IDs (for resumability)
  const completedRows = await database
    .select({ transcriptId: caseResults.transcriptId })
    .from(caseResults)
    .where(and(eq(caseResults.runId, runId), eq(caseResults.status, "completed")));

  const completedIds = new Set(completedRows.map((r) => r.transcriptId));
  const remaining = evalItems.filter((item) => !completedIds.has(item.id));

  if (remaining.length === 0) {
    // All done (resume found nothing to do)
    await finishRun(runId, startedAt, database);
    return;
  }

  // Insert pending case rows (ON CONFLICT DO NOTHING = idempotent)
  const pendingToInsert = remaining.filter((item) => {
    // Don't re-insert rows that already exist (e.g. pending from a previous interrupted run)
    return true;
  });

  if (pendingToInsert.length > 0) {
    for (const item of pendingToInsert) {
      await database
        .insert(caseResults)
        .values({
          id: newId(),
          runId,
          transcriptId: item.id,
          status: "pending",
        })
        .onConflictDoNothing();
    }
  }

  // Fetch the IDs of the case_result rows we just inserted (or previously existed as pending)
  const pendingRows = await database
    .select({ id: caseResults.id, transcriptId: caseResults.transcriptId })
    .from(caseResults)
    .where(
      and(
        eq(caseResults.runId, runId),
        inArray(
          caseResults.transcriptId,
          remaining.map((i) => i.id),
        ),
      ),
    );

  const transcriptIdToRowId = new Map(pendingRows.map((r) => [r.transcriptId, r.id]));

  const semaphore = new Semaphore(5);

  await Promise.all(
    remaining.map((item) =>
      semaphore.use(async () => {
        const caseResultId = transcriptIdToRowId.get(item.id);
        if (!caseResultId) return;

        const result = await processCase(
          item,
          runId,
          caseResultId,
          strategy,
          model,
          database,
          examples,
          extractFn,
        );

        // Atomically increment run aggregates
        await database
          .update(runs)
          .set({
            completedCasesCount: sql`${runs.completedCasesCount} + 1`,
            tokensIn: sql`${runs.tokensIn} + ${result?.tokenStats.inputTokens ?? 0}`,
            tokensOut: sql`${runs.tokensOut} + ${result?.tokenStats.outputTokens ?? 0}`,
            cacheReadTokens: sql`${runs.cacheReadTokens} + ${result?.tokenStats.cacheReadTokens ?? 0}`,
            cacheWriteTokens: sql`${runs.cacheWriteTokens} + ${result?.tokenStats.cacheWriteTokens ?? 0}`,
            costUsd: sql`${runs.costUsd} + ${result?.costUsd ?? 0}`,
          })
          .where(eq(runs.id, runId));

        // Emit SSE progress
        if (result) {
          const updatedCase = await database
            .select()
            .from(caseResults)
            .where(eq(caseResults.id, caseResultId));
          const cr = updatedCase[0];
          if (cr) {
            const event: SseEvent = {
              type: "case_complete",
              data: {
                id: cr.id,
                run_id: cr.runId,
                transcript_id: cr.transcriptId,
                status: cr.status as "completed" | "failed" | "pending",
                attempt_count: cr.attemptCount,
                schema_valid: cr.schemaValid,
                prediction: cr.prediction as import("@test-evals/shared").ClinicalExtraction | null,
                scores: cr.scores as CaseScore | null,
                hallucination_count: cr.hallucinationCount,
                tokens_in: cr.tokensIn,
                tokens_out: cr.tokensOut,
                cache_read_tokens: cr.cacheReadTokens,
                cost_usd: cr.costUsd,
                created_at: cr.createdAt.toISOString(),
              },
            };
            emit(runId, event);
          }
        }
      }),
    ),
  );

  await finishRun(runId, startedAt, database);
}

async function finishRun(runId: string, startedAt: Date, database: Db): Promise<void> {
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  const updatedRun = await database
    .update(runs)
    .set({ status: "completed", completedAt, durationMs })
    .where(eq(runs.id, runId))
    .returning();

  const run = updatedRun[0];
  if (run) {
    const event: SseEvent = { type: "run_complete", data: mapToSummary(run) };
    emit(runId, event);
  }
}
