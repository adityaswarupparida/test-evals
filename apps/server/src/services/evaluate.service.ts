import type {
  ClinicalExtraction,
  Medication,
  Diagnosis,
  CaseScore,
  VitalsScore,
  MedicationScore,
  MedicationMatchPair,
  DiagnosisScore,
  PlanScore,
  FollowUpScore,
} from "@test-evals/shared";

// Tokenize: lowercase, strip non-alphanumeric, split on whitespace
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0),
  );
}

export function jaccardSim(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const intersection = new Set([...ta].filter((t) => tb.has(t)));
  const union = new Set([...ta, ...tb]);
  if (union.size === 0) return 1;
  return intersection.size / union.size;
}

function setF1(
  goldItems: string[],
  predItems: string[],
  threshold: number,
): { precision: number; recall: number; f1: number } {
  if (goldItems.length === 0 && predItems.length === 0) {
    return { precision: 1, recall: 1, f1: 1 };
  }
  if (goldItems.length === 0) return { precision: 0, recall: 1, f1: 0 };
  if (predItems.length === 0) return { precision: 1, recall: 0, f1: 0 };

  let matched = 0;
  const usedPred = new Set<number>();

  for (const goldItem of goldItems) {
    let bestIdx = -1;
    let bestSim = threshold - 0.001;
    for (let pi = 0; pi < predItems.length; pi++) {
      if (usedPred.has(pi)) continue;
      const pred = predItems[pi];
      if (pred === undefined) continue;
      const sim = jaccardSim(goldItem, pred);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = pi;
      }
    }
    if (bestIdx >= 0) {
      matched++;
      usedPred.add(bestIdx);
    }
  }

  const precision = matched / predItems.length;
  const recall = matched / goldItems.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

// Normalize dose: strip spaces, lowercase  "400 mg" → "400mg"
function normalizeDose(dose: string | null): string {
  if (!dose) return "";
  return dose.toLowerCase().replace(/\s+/g, "");
}

// Normalize frequency: map common abbreviations to canonical form
const FREQ_MAP: Record<string, string> = {
  bid: "twice daily",
  "twice daily": "twice daily",
  "2x/day": "twice daily",
  "2x daily": "twice daily",
  "two times daily": "twice daily",
  qd: "daily",
  daily: "daily",
  "once daily": "daily",
  "1x/day": "daily",
  "every day": "daily",
  tid: "three times daily",
  "three times daily": "three times daily",
  "3x/day": "three times daily",
  "3x daily": "three times daily",
  qid: "four times daily",
  "four times daily": "four times daily",
  "4x/day": "four times daily",
  prn: "as needed",
  "as needed": "as needed",
  "every 6 hours": "every 6 hours",
  "q6h": "every 6 hours",
  "every 8 hours": "every 8 hours",
  "q8h": "every 8 hours",
  "every 12 hours": "every 12 hours",
  "q12h": "every 12 hours",
  "every 4 hours": "every 4 hours",
  "q4h": "every 4 hours",
};

function normalizeFreq(freq: string | null): string {
  if (!freq) return "";
  const lower = freq.toLowerCase().trim();
  return FREQ_MAP[lower] ?? lower;
}

// ─── Field scorers ───────────────────────────────────────────────────────────

function scoreChiefComplaint(pred: string, gold: string): number {
  return jaccardSim(pred, gold);
}

function scoreVitals(pred: ClinicalExtraction["vitals"], gold: ClinicalExtraction["vitals"]): VitalsScore {
  const bp =
    gold.bp === null && pred.bp === null
      ? null
      : gold.bp !== null && pred.bp !== null
        ? pred.bp.replace(/\s+/g, "") === gold.bp.replace(/\s+/g, "")
        : false;

  const hr =
    gold.hr === null && pred.hr === null
      ? null
      : gold.hr !== null && pred.hr !== null
        ? pred.hr === gold.hr
        : false;

  const temp_f =
    gold.temp_f === null && pred.temp_f === null
      ? null
      : gold.temp_f !== null && pred.temp_f !== null
        ? { exact: pred.temp_f === gold.temp_f, within_tolerance: Math.abs(pred.temp_f - gold.temp_f) <= 0.2 }
        : { exact: false, within_tolerance: false };

  const spo2 =
    gold.spo2 === null && pred.spo2 === null
      ? null
      : gold.spo2 !== null && pred.spo2 !== null
        ? pred.spo2 === gold.spo2
        : false;

  const fields: Array<boolean | { within_tolerance: boolean } | null> = [bp, hr, temp_f, spo2];
  const nonNull = fields.filter((f) => f !== null);
  let correct = 0;
  for (const f of nonNull) {
    if (typeof f === "boolean") {
      if (f) correct++;
    } else if (f !== null) {
      if (f.within_tolerance) correct++;
    }
  }
  const aggregate = nonNull.length === 0 ? 1 : correct / nonNull.length;

  return { bp, hr, temp_f, spo2, aggregate };
}

function scoreMedications(pred: Medication[], gold: Medication[]): MedicationScore {
  if (gold.length === 0 && pred.length === 0) {
    return { precision: 1, recall: 1, f1: 1, matched_pairs: [] };
  }
  if (gold.length === 0) return { precision: 0, recall: 1, f1: 0, matched_pairs: [] };
  if (pred.length === 0) return { precision: 1, recall: 0, f1: 0, matched_pairs: [] };

  const matched_pairs: MedicationMatchPair[] = [];
  const usedPred = new Set<number>();
  let matchedGold = 0;

  for (const goldMed of gold) {
    let bestIdx = -1;
    let bestSim = 0.5 - 0.001; // threshold
    for (let pi = 0; pi < pred.length; pi++) {
      if (usedPred.has(pi)) continue;
      const predMed = pred[pi];
      if (!predMed) continue;
      const sim = jaccardSim(predMed.name, goldMed.name);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = pi;
      }
    }

    if (bestIdx >= 0) {
      const predMed = pred[bestIdx]!;
      const dose_match = normalizeDose(predMed.dose) === normalizeDose(goldMed.dose);
      const freq_match =
        normalizeFreq(predMed.frequency) === normalizeFreq(goldMed.frequency) ||
        jaccardSim(predMed.frequency ?? "", goldMed.frequency ?? "") >= 0.6;
      const route_match =
        (predMed.route ?? "").toLowerCase().trim() === (goldMed.route ?? "").toLowerCase().trim();

      matched_pairs.push({
        gold_name: goldMed.name,
        pred_name: predMed.name,
        name_sim: bestSim,
        dose_match,
        freq_match,
        route_match,
      });
      usedPred.add(bestIdx);
      matchedGold++;
    }
  }

  const precision = matchedGold / pred.length;
  const recall = matchedGold / gold.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, matched_pairs };
}

function scoreDiagnoses(pred: Diagnosis[], gold: Diagnosis[]): DiagnosisScore {
  if (gold.length === 0 && pred.length === 0) {
    return { precision: 1, recall: 1, f1: 1, icd10_bonus: 0 };
  }
  if (gold.length === 0) return { precision: 0, recall: 1, f1: 0, icd10_bonus: 0 };
  if (pred.length === 0) return { precision: 1, recall: 0, f1: 0, icd10_bonus: 0 };

  const usedPred = new Set<number>();
  let matchedGold = 0;
  let icd10_bonus = 0;

  for (const goldDx of gold) {
    let bestIdx = -1;
    let bestSim = 0.4 - 0.001;
    for (let pi = 0; pi < pred.length; pi++) {
      if (usedPred.has(pi)) continue;
      const predDx = pred[pi];
      if (!predDx) continue;
      const sim = jaccardSim(predDx.description, goldDx.description);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = pi;
      }
    }

    if (bestIdx >= 0) {
      const predDx = pred[bestIdx]!;
      matchedGold++;
      usedPred.add(bestIdx);
      if (goldDx.icd10 && predDx.icd10 && goldDx.icd10 === predDx.icd10) {
        icd10_bonus++;
      }
    }
  }

  const precision = matchedGold / pred.length;
  const recall = matchedGold / gold.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, icd10_bonus };
}

function scorePlan(pred: string[], gold: string[]): PlanScore {
  return setF1(gold, pred, 0.5);
}

function scoreFollowUp(
  pred: ClinicalExtraction["follow_up"],
  gold: ClinicalExtraction["follow_up"],
): FollowUpScore {
  const interval_days_exact =
    gold.interval_days === null && pred.interval_days === null
      ? null
      : gold.interval_days !== null && pred.interval_days !== null
        ? pred.interval_days === gold.interval_days
        : false;

  const reason_ratio =
    gold.reason !== null && pred.reason !== null
      ? jaccardSim(pred.reason, gold.reason)
      : gold.reason === null && pred.reason === null
        ? null
        : 0;

  return { interval_days_exact, reason_ratio };
}

// ─── Hallucination detection ─────────────────────────────────────────────────

function extractBestWindow(transcript: string, query: string): string {
  const words = transcript.split(/\s+/);
  const queryLen = query.split(/\s+/).length;
  const windowSize = Math.max(queryLen + 2, 3);
  let best = "";
  let bestSim = 0;
  for (let i = 0; i <= words.length - windowSize; i++) {
    const window = words.slice(i, i + windowSize).join(" ");
    const sim = jaccardSim(window, query);
    if (sim > bestSim) {
      bestSim = sim;
      best = window;
    }
  }
  return best;
}

export function detectHallucinations(pred: ClinicalExtraction, transcript: string): number {
  const lowerTranscript = transcript.toLowerCase();
  let count = 0;

  for (const med of pred.medications) {
    const tokens = tokenize(med.name);
    const anyTokenPresent = [...tokens].some((t) => t.length > 3 && lowerTranscript.includes(t));
    if (!anyTokenPresent) {
      const windowSim = jaccardSim(med.name, extractBestWindow(lowerTranscript, med.name.toLowerCase()));
      if (windowSim < 0.4) count++;
    }
  }

  for (const dx of pred.diagnoses) {
    const tokens = tokenize(dx.description);
    const anyTokenPresent = [...tokens].some((t) => t.length > 3 && lowerTranscript.includes(t));
    if (!anyTokenPresent) {
      const windowSim = jaccardSim(dx.description, extractBestWindow(lowerTranscript, dx.description.toLowerCase()));
      if (windowSim < 0.3) count++;
    }
  }

  for (const item of pred.plan) {
    const tokens = tokenize(item);
    const anyTokenPresent = [...tokens].some((t) => t.length > 3 && lowerTranscript.includes(t));
    if (!anyTokenPresent) count++;
  }

  return count;
}

// ─── Aggregate scorer ────────────────────────────────────────────────────────

const WEIGHTS = {
  chief_complaint: 0.1,
  vitals: 0.15,
  medications: 0.25,
  diagnoses: 0.25,
  plan: 0.15,
  follow_up: 0.1,
};

function followUpScalar(score: FollowUpScore): number {
  const parts: number[] = [];
  if (score.interval_days_exact !== null) {
    parts.push(score.interval_days_exact ? 1 : 0);
  }
  if (score.reason_ratio !== null) {
    parts.push(score.reason_ratio);
  }
  if (parts.length === 0) return 1; // both null → correct
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

export function evaluateCase(pred: ClinicalExtraction, gold: ClinicalExtraction, transcript: string): CaseScore {
  const chief_complaint = { ratio: scoreChiefComplaint(pred.chief_complaint, gold.chief_complaint) };
  const vitals = scoreVitals(pred.vitals, gold.vitals);
  const medications = scoreMedications(pred.medications, gold.medications);
  const diagnoses = scoreDiagnoses(pred.diagnoses, gold.diagnoses);
  const plan = scorePlan(pred.plan, gold.plan);
  const follow_up = scoreFollowUp(pred.follow_up, gold.follow_up);
  const hallucination_count = detectHallucinations(pred, transcript);

  const aggregate_f1 =
    chief_complaint.ratio * WEIGHTS.chief_complaint +
    vitals.aggregate * WEIGHTS.vitals +
    medications.f1 * WEIGHTS.medications +
    diagnoses.f1 * WEIGHTS.diagnoses +
    plan.f1 * WEIGHTS.plan +
    followUpScalar(follow_up) * WEIGHTS.follow_up;

  return {
    chief_complaint,
    vitals,
    medications,
    diagnoses,
    plan,
    follow_up,
    hallucination_count,
    aggregate_f1,
  };
}
