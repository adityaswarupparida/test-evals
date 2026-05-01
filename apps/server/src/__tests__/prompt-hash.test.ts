import { describe, it, expect } from "bun:test";
import { computePromptHash } from "@test-evals/llm";

describe("computePromptHash", () => {
  it("returns the same hash for identical inputs", () => {
    const h1 = computePromptHash("zero_shot", "claude-haiku-4-5-20251001");
    const h2 = computePromptHash("zero_shot", "claude-haiku-4-5-20251001");
    expect(h1).toBe(h2);
  });

  it("returns a different hash for different strategies", () => {
    const h1 = computePromptHash("zero_shot", "claude-haiku-4-5-20251001");
    const h2 = computePromptHash("cot", "claude-haiku-4-5-20251001");
    expect(h1).not.toBe(h2);
  });

  it("returns a different hash for different models", () => {
    const h1 = computePromptHash("zero_shot", "claude-haiku-4-5-20251001");
    const h2 = computePromptHash("zero_shot", "claude-sonnet-4-6");
    expect(h1).not.toBe(h2);
  });

  it("returns a 16-char hex string", () => {
    const h = computePromptHash("few_shot", "claude-haiku-4-5-20251001");
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns different hash when few_shot examples change", () => {
    const examples1 = [
      {
        id: "case_001",
        transcript: "Doctor: How are you?",
        gold: {
          chief_complaint: "check-up",
          vitals: { bp: null, hr: null, temp_f: null, spo2: null },
          medications: [],
          diagnoses: [],
          plan: [],
          follow_up: { interval_days: null, reason: null },
        },
      },
    ];
    const examples2 = [
      {
        id: "case_002",
        transcript: "Patient: I have a cough.",
        gold: {
          chief_complaint: "cough",
          vitals: { bp: null, hr: null, temp_f: null, spo2: null },
          medications: [],
          diagnoses: [],
          plan: [],
          follow_up: { interval_days: null, reason: null },
        },
      },
    ];
    const h1 = computePromptHash("few_shot", "claude-haiku-4-5-20251001", examples1);
    const h2 = computePromptHash("few_shot", "claude-haiku-4-5-20251001", examples2);
    expect(h1).not.toBe(h2);
  });
});
