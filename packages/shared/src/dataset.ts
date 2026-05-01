import type { ClinicalExtraction } from "./extraction";

export type DatasetItem = {
  id: string;
  transcript: string;
  gold: ClinicalExtraction;
};
