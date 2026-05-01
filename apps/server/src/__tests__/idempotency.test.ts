import { describe, it, expect } from "bun:test";

// Tests idempotency behavior: same (strategy, model) pair should not
// re-run LLM calls if a completed run with the same prompt_hash exists.

describe("idempotency", () => {
  it("ON CONFLICT DO NOTHING prevents duplicate case_result rows", () => {
    // Simulates two concurrent inserts for the same (runId, transcriptId)
    const store = new Map<string, string>(); // key → id
    let llmCalls = 0;

    const insertIfAbsent = (runId: string, transcriptId: string): boolean => {
      const key = `${runId}:${transcriptId}`;
      if (store.has(key)) return false; // conflict — do nothing
      store.set(key, crypto.randomUUID());
      return true; // inserted
    };

    const processCase = (runId: string, transcriptId: string) => {
      const inserted = insertIfAbsent(runId, transcriptId);
      if (inserted) llmCalls++;
    };

    // Two concurrent "runs" of the same case
    processCase("run1", "case_001");
    processCase("run1", "case_001"); // duplicate

    expect(store.size).toBe(1);
    expect(llmCalls).toBe(1); // LLM called only once
  });

  it("same prompt_hash → existing completed run is returned without re-running", () => {
    // Simulates the route handler idempotency check:
    // if a completed run with the same prompt_hash exists, return it

    type Run = { id: string; promptHash: string; status: string };
    const existingRuns: Run[] = [
      { id: "run-existing", promptHash: "abc123def456789", status: "completed" },
    ];

    const findExistingRun = (promptHash: string): Run | undefined => {
      return existingRuns.find((r) => r.promptHash === promptHash && r.status === "completed");
    };

    let newRunsCreated = 0;
    const createOrFindRun = (promptHash: string, force = false) => {
      if (!force) {
        const existing = findExistingRun(promptHash);
        if (existing) return existing;
      }
      newRunsCreated++;
      const newRun: Run = { id: crypto.randomUUID(), promptHash, status: "pending" };
      existingRuns.push(newRun);
      return newRun;
    };

    // First call — no existing run
    const run1 = createOrFindRun("new-hash-999");
    expect(newRunsCreated).toBe(1);

    // Second call with same hash — returns existing
    const run2 = createOrFindRun("abc123def456789");
    expect(run2.id).toBe("run-existing");
    expect(newRunsCreated).toBe(1); // not incremented

    // Force=true bypasses idempotency
    const run3 = createOrFindRun("abc123def456789", true);
    expect(run3.id).not.toBe("run-existing");
    expect(newRunsCreated).toBe(2);

    void run1;
    void run3;
  });

  it("different strategies produce different prompt_hashes", async () => {
    const { computePromptHash } = await import("@test-evals/llm");

    const h1 = computePromptHash("zero_shot", "claude-haiku-4-5-20251001");
    const h2 = computePromptHash("cot", "claude-haiku-4-5-20251001");
    const h3 = computePromptHash("few_shot", "claude-haiku-4-5-20251001");

    const hashes = new Set([h1, h2, h3]);
    expect(hashes.size).toBe(3); // all distinct → three different cache entries
  });
});
