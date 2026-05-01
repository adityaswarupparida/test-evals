import type { SSEStreamingApi } from "hono/streaming";
import type { SseEvent } from "@test-evals/shared";

type SseClient = {
  stream: SSEStreamingApi;
};

const registry = new Map<string, Set<SseClient>>();

export function subscribe(runId: string, client: SseClient): void {
  let clients = registry.get(runId);
  if (!clients) {
    clients = new Set();
    registry.set(runId, clients);
  }
  clients.add(client);
}

export function unsubscribe(runId: string, client: SseClient): void {
  const clients = registry.get(runId);
  if (!clients) return;
  clients.delete(client);
  if (clients.size === 0) registry.delete(runId);
}

export function emit(runId: string, event: SseEvent): void {
  const clients = registry.get(runId);
  if (!clients) return;
  for (const client of clients) {
    client.stream
      .writeSSE({ event: event.type, data: JSON.stringify(event) })
      .catch(() => {
        // Client disconnected — cleanup happens via onAbort
      });
  }
}
