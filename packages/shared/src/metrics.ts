export type ChiefComplaintScore = {
  ratio: number;
};

export type VitalsScore = {
  bp: boolean | null;
  hr: boolean | null;
  temp_f: { exact: boolean; within_tolerance: boolean } | null;
  spo2: boolean | null;
  aggregate: number;
};

export type MedicationMatchPair = {
  gold_name: string;
  pred_name: string;
  name_sim: number;
  dose_match: boolean;
  freq_match: boolean;
  route_match: boolean;
};

export type MedicationScore = {
  precision: number;
  recall: number;
  f1: number;
  matched_pairs: MedicationMatchPair[];
};

export type DiagnosisScore = {
  precision: number;
  recall: number;
  f1: number;
  icd10_bonus: number;
};

export type PlanScore = {
  precision: number;
  recall: number;
  f1: number;
};

export type FollowUpScore = {
  interval_days_exact: boolean | null;
  reason_ratio: number | null;
};

export type CaseScore = {
  chief_complaint: ChiefComplaintScore;
  vitals: VitalsScore;
  medications: MedicationScore;
  diagnoses: DiagnosisScore;
  plan: PlanScore;
  follow_up: FollowUpScore;
  hallucination_count: number;
  aggregate_f1: number;
};
