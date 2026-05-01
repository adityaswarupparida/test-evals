import { describe, it, expect, mock } from "bun:test";
import { withBackoff } from "@test-evals/llm";

describe("withBackoff", () => {
  it("returns successfully after two 429s", async () => {
    let calls = 0;
    const fn = mock(async () => {
      calls++;
      if (calls < 3) throw { status: 429 };
      return "ok";
    });

    const t0 = Date.now();
    const result = await withBackoff(fn, 5, 10); // 10ms base for fast tests
    const elapsed = Date.now() - t0;

    expect(result).toBe("ok");
    expect(calls).toBe(3);
    // Should have delayed at least 10ms + 20ms between retries
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });

  it("throws after maxAttempts consecutive 429s", async () => {
    let calls = 0;
    const fn = mock(async () => {
      calls++;
      throw { status: 429 };
    });

    await expect(withBackoff(fn, 3, 5)).rejects.toMatchObject({ status: 429 });
    expect(calls).toBe(3);
  });

  it("re-throws non-429 errors immediately without retrying", async () => {
    let calls = 0;
    const fn = mock(async () => {
      calls++;
      throw new Error("server error");
    });

    await expect(withBackoff(fn, 5, 5)).rejects.toThrow("server error");
    expect(calls).toBe(1);
  });

  it("succeeds on the first call if no error", async () => {
    const fn = mock(async () => 42);
    const result = await withBackoff(fn, 3, 5);
    expect(result).toBe(42);
    expect(fn.mock.calls.length).toBe(1);
  });
});
