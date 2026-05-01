import type { ClinicalExtraction } from "./extraction";
import type { CaseScore } from "./metrics";

export type RunStatus = "pending" | "running" | "completed" | "failed" | "interrupted";
export type Strategy = "zero_shot" | "few_shot" | "cot";

export type CreateRunRequest = {
  strategy: Strategy;
  model?: string;
  force?: boolean;
};

export type RunSummary = {
  id: string;
  strategy: Strategy;
  model: string;
  status: RunStatus;
  prompt_hash: string;
  started_at: string | null;
  completed_at: string | null;
  total_cases_count: number;
  completed_cases_count: number;
  tokens_in: number;
  tokens_out: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  duration_ms: number | null;
  created_at: string;
};

export type LlmTrace = {
  id: string;
  case_result_id: string;
  attempt: number;
  request_payload: unknown;
  response_payload: unknown;
  cache_read_tokens: number;
  created_at: string;
};

export type CaseResultSummary = {
  id: string;
  run_id: string;
  transcript_id: string;
  status: "pending" | "completed" | "failed";
  attempt_count: number;
  schema_valid: boolean;
  prediction: ClinicalExtraction | null;
  scores: CaseScore | null;
  hallucination_count: number;
  tokens_in: number;
  tokens_out: number;
  cache_read_tokens: number;
  cost_usd: number;
  created_at: string;
  traces?: LlmTrace[];
};

export type RunDetail = RunSummary & {
  case_results: CaseResultSummary[];
};

export type FieldDelta = {
  field: string;
  score_a: number;
  score_b: number;
  delta: number;
  winner: "a" | "b" | "tie";
};

export type CompareResponse = {
  run_a: RunSummary;
  run_b: RunSummary;
  field_deltas: FieldDelta[];
};

export type SseEvent =
  | { type: "case_complete"; data: CaseResultSummary }
  | { type: "run_complete"; data: RunSummary }
  | { type: "ping" }
  | { type: "error"; data: { message: string } };
