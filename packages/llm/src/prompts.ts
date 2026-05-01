import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { DatasetItem, Strategy } from "@test-evals/shared";

// Shared across zero_shot and few_shot — identical text means they share the cache checkpoint
const BASE_SYSTEM = `You are a clinical extraction assistant. Your task is to extract structured clinical information from a doctor-patient transcript and call the submit_extraction tool with the complete, accurate extraction.

Extract all of the following fields:
- chief_complaint: The patient's primary reason for the visit, in their words or a brief clinical summary
- vitals: Blood pressure, heart rate, temperature (°F), and oxygen saturation — set to null for any vital not explicitly stated in the transcript
- medications: Every medication discussed (name, dose, frequency, route) — include medications that were started, continued, changed, or stopped
- diagnoses: Working or confirmed diagnoses — include ICD-10 codes if the physician mentioned them
- plan: Each discrete management action as a separate string
- follow_up: Return interval in days and reason (null if not specified)

Be precise. Only include information that is explicitly stated or clearly implied in the transcript.`;

// CoT: explicitly different — instructs step-by-step reasoning before tool call
const COT_SYSTEM = `You are a clinical extraction assistant. Your task is to extract structured clinical information from a doctor-patient transcript and call the submit_extraction tool.

Before calling submit_extraction, reason through the transcript step by step:
1. Chief complaint — what is the patient's primary reason for this visit?
2. Vitals — which vital signs are explicitly recorded? Set null for any not stated.
3. Medications — list every medication with exact dose, frequency, and route.
4. Diagnoses — what working or confirmed diagnoses did the physician state? Any ICD-10 codes?
5. Plan — what discrete actions did the physician plan? Each action is a separate item.
6. Follow-up — is a specific return interval mentioned? What is the reason?

Write out your reasoning for each field, then call submit_extraction with your final extraction.`;

export function buildSystem(
  strategy: Strategy,
  examples?: DatasetItem[],
): Anthropic.Messages.TextBlockParam[] {
  if (strategy === "cot") {
    return [{ type: "text", text: COT_SYSTEM, cache_control: { type: "ephemeral" } }];
  }

  if (strategy === "few_shot" && examples && examples.length > 0) {
    const exampleText = examples
      .map(
        (ex, i) => `
### Worked Example ${i + 1}

<transcript>
${ex.transcript}
</transcript>

<expected_extraction>
${JSON.stringify(ex.gold, null, 2)}
</expected_extraction>`,
      )
      .join("\n");

    return [
      {
        type: "text",
        text: `${BASE_SYSTEM}\n\nHere are worked examples showing the expected extraction format:\n${exampleText}`,
        cache_control: { type: "ephemeral" },
      },
    ];
  }

  return [{ type: "text", text: BASE_SYSTEM, cache_control: { type: "ephemeral" } }];
}

export function buildMessages(transcript: string): Anthropic.Messages.MessageParam[] {
  return [
    {
      role: "user",
      content: `Extract all clinical information from the following transcript and call submit_extraction.\n\n<transcript>\n${transcript}\n</transcript>`,
    },
  ];
}

export function computePromptHash(
  strategy: Strategy,
  model: string,
  examples?: DatasetItem[],
): string {
  const components = {
    strategy,
    model,
    system_text: strategy === "cot" ? COT_SYSTEM : BASE_SYSTEM,
    few_shot_examples:
      strategy === "few_shot" && examples
        ? examples.map((e) => ({ transcript: e.transcript, gold: e.gold }))
        : [],
  };
  return createHash("sha256").update(JSON.stringify(components)).digest("hex").slice(0, 16);
}
