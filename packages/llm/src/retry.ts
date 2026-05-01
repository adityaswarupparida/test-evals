import Anthropic from "@anthropic-ai/sdk";
import { ClinicalExtractionSchema, type ClinicalExtraction, type DatasetItem, type Strategy } from "@test-evals/shared";
import { getAnthropicClient } from "./client";
import { withBackoff } from "./backoff";
import { buildSystem, buildMessages } from "./prompts";
import { SUBMIT_EXTRACTION_TOOL } from "./tool-schema";
import { computeCostUsd, sumTokenStats, type TokenStats } from "./cost";

export type AttemptResult = {
  attempt: number;
  requestMessages: Anthropic.Messages.MessageParam[];
  responseContent: Anthropic.Messages.ContentBlock[];
  parsed: ClinicalExtraction | null;
  schemaValid: boolean;
  validationError: string | null;
  tokenStats: TokenStats;
};

export type ExtractionResult = {
  prediction: ClinicalExtraction | null;
  traces: AttemptResult[];
  schemaValid: boolean;
  tokenStats: TokenStats;
  costUsd: number;
};

function getTokenStats(response: Anthropic.Messages.Message): TokenStats {
  const usage = response.usage as {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
  // DEBUG: remove after confirming cache behaviour
  console.debug("[cache-debug] usage:", JSON.stringify(response.usage));
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

export async function runExtractionWithRetry(
  transcript: string,
  strategy: Strategy,
  model: string,
  examples?: DatasetItem[],
  maxAttempts = 3,
): Promise<ExtractionResult> {
  const client = getAnthropicClient();
  const systemBlocks = buildSystem(strategy, examples);
  const traces: AttemptResult[] = [];

  const messages: Anthropic.Messages.MessageParam[] = buildMessages(transcript);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const snapshotMessages = [...messages];

    // const toolWithCache = { ...SUBMIT_EXTRACTION_TOOL, cache_control: { type: "ephemeral" as const } };
    // DEBUG: verify cache_control is present in outgoing request
    // if (attempt === 1) {
    //   console.debug("[cache-debug] tool cache_control:", JSON.stringify(toolWithCache.cache_control));
    //   console.debug("[cache-debug] system[0] cache_control:", JSON.stringify(systemBlocks[0]?.cache_control));
    // }

    const response = await withBackoff(() =>
      client.messages.create({
        model,
        max_tokens: 4096,
        system: systemBlocks,
        tools: [SUBMIT_EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: "submit_extraction" },
        messages,
      }),
    );

    const stats = getTokenStats(response);
    const toolUseBlock = response.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );

    if (!toolUseBlock) {
      traces.push({
        attempt,
        requestMessages: snapshotMessages,
        responseContent: response.content,
        parsed: null,
        schemaValid: false,
        validationError: "No tool_use block in response",
        tokenStats: stats,
      });
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: "Please call the submit_extraction tool." });
      continue;
    }

    const parseResult = ClinicalExtractionSchema.safeParse(toolUseBlock.input);

    if (parseResult.success) {
      traces.push({
        attempt,
        requestMessages: snapshotMessages,
        responseContent: response.content,
        parsed: parseResult.data,
        schemaValid: true,
        validationError: null,
        tokenStats: stats,
      });
      const totalStats = sumTokenStats(traces.map((t) => t.tokenStats));
      return {
        prediction: parseResult.data,
        traces,
        schemaValid: true,
        tokenStats: totalStats,
        costUsd: computeCostUsd(totalStats, model),
      };
    }

    const errors = parseResult.error.issues
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");

    traces.push({
      attempt,
      requestMessages: snapshotMessages,
      responseContent: response.content,
      parsed: null,
      schemaValid: false,
      validationError: errors,
      tokenStats: stats,
    });

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseBlock.id,
          content: `Validation failed: ${errors}. Please correct the extraction and call submit_extraction again.`,
          is_error: true,
        },
      ],
    });
  }

  // All attempts exhausted
  const lastTrace = traces[traces.length - 1];
  const totalStats = sumTokenStats(traces.map((t) => t.tokenStats));
  return {
    prediction: lastTrace?.parsed ?? null,
    traces,
    schemaValid: false,
    tokenStats: totalStats,
    costUsd: computeCostUsd(totalStats, model),
  };
}
