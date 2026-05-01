import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const runStatusEnum = pgEnum("run_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "interrupted",
]);

export const strategyEnum = pgEnum("strategy", ["zero_shot", "few_shot", "cot"]);

export const caseResultStatusEnum = pgEnum("case_result_status", [
  "pending",
  "completed",
  "failed",
]);

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  strategy: strategyEnum("strategy").notNull(),
  model: text("model").notNull(),
  status: runStatusEnum("status").notNull().default("pending"),
  promptHash: text("prompt_hash").notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  totalCasesCount: integer("total_cases_count").notNull().default(0),
  completedCasesCount: integer("completed_cases_count").notNull().default(0),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const caseResults = pgTable(
  "case_results",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    transcriptId: text("transcript_id").notNull(),
    status: caseResultStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    schemaValid: boolean("schema_valid").notNull().default(false),
    prediction: jsonb("prediction"),
    scores: jsonb("scores"),
    hallucinationCount: integer("hallucination_count").notNull().default(0),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("case_results_run_id_idx").on(table.runId),
    index("case_results_run_transcript_idx").on(table.runId, table.transcriptId),
  ],
);

export const llmTraces = pgTable(
  "llm_traces",
  {
    id: text("id").primaryKey(),
    caseResultId: text("case_result_id")
      .notNull()
      .references(() => caseResults.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    requestPayload: jsonb("request_payload").notNull(),
    responsePayload: jsonb("response_payload").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("llm_traces_case_result_id_idx").on(table.caseResultId)],
);

export const runsRelations = relations(runs, ({ many }) => ({
  caseResults: many(caseResults),
}));

export const caseResultsRelations = relations(caseResults, ({ one, many }) => ({
  run: one(runs, { fields: [caseResults.runId], references: [runs.id] }),
  llmTraces: many(llmTraces),
}));

export const llmTracesRelations = relations(llmTraces, ({ one }) => ({
  caseResult: one(caseResults, {
    fields: [llmTraces.caseResultId],
    references: [caseResults.id],
  }),
}));
