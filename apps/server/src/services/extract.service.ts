import { runExtractionWithRetry } from "@test-evals/llm";
import type { AttemptResult, ExtractionResult } from "@test-evals/llm";
import type { DatasetItem, Strategy } from "@test-evals/shared";

export type { AttemptResult, ExtractionResult };

export async function extractFromTranscript(
  transcript: string,
  strategy: Strategy,
  model: string,
  examples?: DatasetItem[],
): Promise<ExtractionResult> {
  return runExtractionWithRetry(transcript, strategy, model, examples);
}
