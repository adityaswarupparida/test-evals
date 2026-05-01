import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

// Lazy initialization — env is not validated at module load time (safe for tests)
export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    _client = new Anthropic({ 
      apiKey,
      defaultHeaders: {
        "anthropic-beta": "prompt-caching-2024-07-31",
      }
    });
  }
  return _client;
}
