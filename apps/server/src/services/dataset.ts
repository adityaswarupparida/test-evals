import { readdir } from "node:fs/promises";
import type { ClinicalExtraction, DatasetItem } from "@test-evals/shared";

const DATA_ROOT = new URL("../../../../data", import.meta.url).pathname;

async function loadDataset(): Promise<DatasetItem[]> {
  const transcriptDir = `${DATA_ROOT}/transcripts`;
  const goldDir = `${DATA_ROOT}/gold`;
  const files = await readdir(transcriptDir);

  const items: DatasetItem[] = [];
  for (const file of files.filter((f) => f.endsWith(".txt")).sort()) {
    const id = file.replace(".txt", "");
    const transcript = await Bun.file(`${transcriptDir}/${file}`).text();
    const gold = (await Bun.file(`${goldDir}/${id}.json`).json()) as ClinicalExtraction;
    items.push({ id, transcript, gold });
  }
  return items;
}

// Eager load once at module init — 50 files ~100KB, negligible
const datasetPromise: Promise<DatasetItem[]> = loadDataset();

export async function getDataset(): Promise<DatasetItem[]> {
  return datasetPromise;
}
