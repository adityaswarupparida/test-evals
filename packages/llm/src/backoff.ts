function isRateLimitError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: number }).status === 429
  );
}

function getRetryAfterMs(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const headers = (err as { headers?: unknown }).headers;
  if (!headers || typeof headers !== "object") return null;
  const get = (headers as { get?: (key: string) => string | null }).get;
  if (typeof get !== "function") return null;
  const value = get.call(headers, "retry-after");
  if (!value) return null;
  const seconds = parseInt(value, 10);
  return isNaN(seconds) ? null : seconds * 1000 + 500; // +500ms buffer
}

export async function withBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 8,
  baseMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (isRateLimitError(err) && i < maxAttempts - 1) {
        // Prefer the API's own retry-after header over guessing
        const delay = getRetryAfterMs(err) ?? baseMs * Math.pow(2, i) + Math.random() * 500;
        await new Promise<void>((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
