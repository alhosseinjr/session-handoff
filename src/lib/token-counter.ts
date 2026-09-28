// src/lib/token-counter.ts
// Fast, client-side token estimation using a simple heuristic.
// Approximates GPT-style tokenization without loading a full tokenizer library.

/**
 * Estimate token count for a string.
 * Uses the ~4 chars per token heuristic, with adjustments for code blocks.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Code tends to have shorter tokens (operators, brackets)
  const codeBlockPattern = /```[\s\S]*?```/g;
  let codeTokens = 0;
  let plainText = text;

  const codeMatches = text.match(codeBlockPattern);
  if (codeMatches) {
    for (const block of codeMatches) {
      codeTokens += Math.ceil(block.length / 3.2); // code is ~3.2 chars/token
      plainText = plainText.replace(block, '');
    }
  }

  // Plain text is ~4 chars/token for English, ~2-3 for other languages
  const plainTokens = Math.ceil(plainText.length / 4);
  return plainTokens + codeTokens;
}

/**
 * Estimate tokens for an array of messages.
 */
export function estimateMessagesTokens(messages: { text: string }[]): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.text);
    total += 4; // per-message overhead (role, separators)
  }
  return total;
}

/**
 * Known context window sizes for popular models (in tokens).
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
  'o1': 200_000,
  'o1-mini': 128_000,
  'o3': 200_000,
  'o3-mini': 200_000,
  'o4-mini': 200_000,
  // Anthropic
  'claude-sonnet-4-20250514': 200_000,
  'claude-opus-4-20250514': 200_000,
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-haiku-20240307': 200_000,
  // Google
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'gemini-2.0-flash': 1_000_000,
  'gemini-1.5-pro': 2_000_000,
  'gemini-1.5-flash': 1_000_000,
  // Groq
  'openai/gpt-oss-120b': 65_536,
  'openai/gpt-oss-20b': 65_536,
  'mixtral-8x7b-32768': 32_768,
  // Default
  default: 128_000,
};

/**
 * Get context limit for a model, with fallback.
 */
export function getContextLimit(model: string): number {
  return MODEL_CONTEXT_LIMITS[model] ?? MODEL_CONTEXT_LIMITS['default'];
}

/**
 * Format a token count as a human-readable string with k/M suffix.
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}
