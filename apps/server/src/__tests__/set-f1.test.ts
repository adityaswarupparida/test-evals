import { describe, it, expect } from "bun:test";
import { evaluateCase, jaccardSim } from "../services/evaluate.service";
import type { ClinicalExtraction } from "@test-evals/shared";

const BASE: ClinicalExtraction = {
  chief_complaint: "test",
  vitals: { bp: null, hr: null, temp_f: null, spo2: null },
  medications: [],
  diagnoses: [],
  plan: [],
  follow_up: { interval_days: null, reason: null },
};

describe("jaccardSim", () => {
  it("returns 1 for identical strings", () => {
    expect(jaccardSim("viral upper respiratory infection", "viral upper respiratory infection")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(jaccardSim("hypertension", "ibuprofen")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(jaccardSim("Ibuprofen", "ibuprofen")).toBe(1);
  });

  it("handles partial overlap", () => {
    const sim = jaccardSim("upper respiratory infection", "viral upper respiratory");
    expect(sim).toBeGreaterThan(0.4);
    expect(sim).toBeLessThan(1);
  });
});

describe("plan set F1", () => {
  it("scores 1 for a perfect plan match", () => {
    const gold: ClinicalExtraction = {
      ...BASE,
      plan: ["rest and fluids", "ibuprofen 400mg"],
    };
    const pred: ClinicalExtraction = { ...gold };
    const score = evaluateCase(pred, gold, "rest and fluids ibuprofen 400mg");
    expect(score.plan.f1).toBeCloseTo(1, 2);
  });

  it("scores 0 when pred plan is empty", () => {
    const gold: ClinicalExtraction = { ...BASE, plan: ["rest and fluids"] };
    const pred: ClinicalExtraction = { ...BASE, plan: [] };
    const score = evaluateCase(pred, gold, "rest and fluids");
    expect(score.plan.f1).toBe(0);
  });

  it("scores 1 when both plans are empty", () => {
    const score = evaluateCase(BASE, BASE, "");
    expect(score.plan.f1).toBe(1);
  });

  it("scores partial F1 correctly", () => {
    const gold: ClinicalExtraction = {
      ...BASE,
      plan: ["rest and fluids", "ibuprofen as needed", "return if worsening"],
    };
    const pred: ClinicalExtraction = {
      ...BASE,
      plan: ["rest and fluids", "ibuprofen as needed"],
    };
    const score = evaluateCase(pred, gold, "rest fluids ibuprofen worsening");
    // 2 matched out of 3 gold, 2 out of 2 pred → P=1, R=2/3 → F1=0.8
    expect(score.plan.precision).toBeCloseTo(1, 1);
    expect(score.plan.recall).toBeCloseTo(0.667, 1);
    expect(score.plan.f1).toBeCloseTo(0.8, 1);
  });
});
