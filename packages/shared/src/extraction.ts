import { z } from "zod";

export const VitalsSchema = z.object({
  bp: z
    .string()
    .regex(/^\d{2,3}\/\d{2,3}$/)
    .nullable(),
  hr: z.number().min(20).max(250).nullable(),
  temp_f: z.number().min(90).max(110).nullable(),
  spo2: z.number().min(50).max(100).nullable(),
});

export const MedicationSchema = z.object({
  name: z.string().min(1),
  dose: z.string().nullable(),
  frequency: z.string().nullable(),
  route: z.string().nullable(),
});

export const DiagnosisSchema = z.object({
  description: z.string().min(1),
  icd10: z
    .string()
    .regex(/^[A-Z]\d{2}(\.[0-9A-Z]{1,4})?$/)
    .optional(),
});

export const FollowUpSchema = z.object({
  interval_days: z.number().min(0).max(730).nullable(),
  reason: z.string().nullable(),
});

export const ClinicalExtractionSchema = z.object({
  chief_complaint: z.string().min(1),
  vitals: VitalsSchema,
  medications: z.array(MedicationSchema),
  diagnoses: z.array(DiagnosisSchema),
  plan: z.array(z.string().min(1)),
  follow_up: FollowUpSchema,
});

export type Vitals = z.infer<typeof VitalsSchema>;
export type Medication = z.infer<typeof MedicationSchema>;
export type Diagnosis = z.infer<typeof DiagnosisSchema>;
export type FollowUp = z.infer<typeof FollowUpSchema>;
export type ClinicalExtraction = z.infer<typeof ClinicalExtractionSchema>;
