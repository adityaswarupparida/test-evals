import { describe, it, expect } from "bun:test";
import { detectHallucinations } from "../services/evaluate.service";
import type { ClinicalExtraction } from "@test-evals/shared";

const BASE: ClinicalExtraction = {
  chief_complaint: "sore throat",
  vitals: { bp: null, hr: null, temp_f: null, spo2: null },
  medications: [],
  diagnoses: [],
  plan: [],
  follow_up: { interval_days: null, reason: null },
};

const COLD_TRANSCRIPT = `
Doctor: What brings you in today?
Patient: I have a sore throat and nasal congestion for four days.
Doctor: Let me take a look. Temperature is 100.4, heart rate 88.
Assessment: Viral upper respiratory infection.
Plan: Supportive care with fluids and saline nasal spray.
Ibuprofen 400 mg every 6 hours as needed for pain and fever.
`;

describe("detectHallucinations", () => {
  it("returns 0 when all medications are grounded in transcript", () => {
    const pred: ClinicalExtraction = {
      ...BASE,
      medications: [
        { name: "ibuprofen", dose: "400 mg", frequency: "every 6 hours", route: "PO" },
      ],
    };
    const count = detectHallucinations(pred, COLD_TRANSCRIPT);
    expect(count).toBe(0);
  });

  it("flags a medication not mentioned in the transcript", () => {
    const pred: ClinicalExtraction = {
      ...BASE,
      medications: [
        { name: "amoxicillin", dose: "500 mg", frequency: "twice daily", route: "PO" },
      ],
    };
    const count = detectHallucinations(pred, COLD_TRANSCRIPT);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("returns 0 when diagnosis matches transcript", () => {
    const pred: ClinicalExtraction = {
      ...BASE,
      diagnoses: [{ description: "viral upper respiratory infection" }],
    };
    const count = detectHallucinations(pred, COLD_TRANSCRIPT);
    expect(count).toBe(0);
  });

  it("flags a diagnosis unrelated to the transcript", () => {
    const pred: ClinicalExtraction = {
      ...BASE,
      diagnoses: [{ description: "type 2 diabetes mellitus uncontrolled" }],
    };
    const count = detectHallucinations(pred, COLD_TRANSCRIPT);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("returns 0 for empty prediction", () => {
    const count = detectHallucinations(BASE, COLD_TRANSCRIPT);
    expect(count).toBe(0);
  });
});
