import { describe, it, expect } from "bun:test";
import { evaluateCase } from "../services/evaluate.service";
import type { ClinicalExtraction } from "@test-evals/shared";

const BASE: ClinicalExtraction = {
  chief_complaint: "test",
  vitals: { bp: null, hr: null, temp_f: null, spo2: null },
  medications: [],
  diagnoses: [],
  plan: [],
  follow_up: { interval_days: null, reason: null },
};

const TRANSCRIPT = "ibuprofen 400 mg every 6 hours amoxicillin 500 mg twice daily";

describe("scoreMedications", () => {
  it("scores 1 for exact medication match", () => {
    const med = { name: "ibuprofen", dose: "400 mg", frequency: "every 6 hours", route: "PO" };
    const ex: ClinicalExtraction = { ...BASE, medications: [med] };
    const score = evaluateCase(ex, ex, TRANSCRIPT);
    expect(score.medications.f1).toBeCloseTo(1, 2);
    expect(score.medications.precision).toBeCloseTo(1, 2);
    expect(score.medications.recall).toBeCloseTo(1, 2);
  });

  it("normalizes case and spacing in names", () => {
    const gold: ClinicalExtraction = {
      ...BASE,
      medications: [{ name: "ibuprofen", dose: "400mg", frequency: "every 6 hours", route: "PO" }],
    };
    const pred: ClinicalExtraction = {
      ...BASE,
      medications: [{ name: "Ibuprofen", dose: "400 mg", frequency: "every 6 hours", route: "PO" }],
    };
    const score = evaluateCase(pred, gold, TRANSCRIPT);
    expect(score.medications.f1).toBeCloseTo(1, 2);
  });

  it("normalizes frequency abbreviations", () => {
    const gold: ClinicalExtraction = {
      ...BASE,
      medications: [{ name: "amoxicillin", dose: "500 mg", frequency: "BID", route: "PO" }],
    };
    const pred: ClinicalExtraction = {
      ...BASE,
      medications: [{ name: "amoxicillin", dose: "500mg", frequency: "twice daily", route: "PO" }],
    };
    const score = evaluateCase(pred, gold, TRANSCRIPT);
    // Name matches, dose matches after norm, freq matches after norm
    expect(score.medications.f1).toBeGreaterThan(0.5);
  });

  it("scores partial F1 for partial match (2 of 3 correct)", () => {
    const gold: ClinicalExtraction = {
      ...BASE,
      medications: [
        { name: "ibuprofen", dose: "400 mg", frequency: "every 6 hours", route: "PO" },
        { name: "amoxicillin", dose: "500 mg", frequency: "twice daily", route: "PO" },
        { name: "prednisone", dose: "40 mg", frequency: "daily", route: "PO" },
      ],
    };
    const pred: ClinicalExtraction = {
      ...BASE,
      medications: [
        { name: "ibuprofen", dose: "400 mg", frequency: "every 6 hours", route: "PO" },
        { name: "amoxicillin", dose: "500 mg", frequency: "twice daily", route: "PO" },
        { name: "metformin", dose: "500 mg", frequency: "daily", route: "PO" }, // hallucinated
      ],
    };
    const score = evaluateCase(pred, gold, TRANSCRIPT);
    // 2 correct, 3 pred, 3 gold → P=2/3, R=2/3 → F1=2/3
    expect(score.medications.f1).toBeCloseTo(0.667, 1);
  });

  it("scores 0 when no medications match", () => {
    const gold: ClinicalExtraction = {
      ...BASE,
      medications: [{ name: "insulin", dose: "10 units", frequency: "daily", route: "SC" }],
    };
    const pred: ClinicalExtraction = {
      ...BASE,
      medications: [{ name: "metformin", dose: "500 mg", frequency: "daily", route: "PO" }],
    };
    const score = evaluateCase(pred, gold, "insulin metformin");
    expect(score.medications.f1).toBe(0);
  });
});
