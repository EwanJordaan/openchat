import type { CoreMessage } from "ai";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // rough: ~4 chars per token
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>,
): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
}

/**
 * If total tokens > 12000, summarize oldest 50% via truncation stub.
 * Phase 2 stub: just truncate oldest messages and prepend a synthetic summary.
 * A future version would call an LLM to summarize.
 */
export function compressMessages(
  messages: Array<{ role: string; content: string }>,
  limit = 12000,
): Array<{ role: string; content: string }> {
  const total = estimateMessagesTokens(messages);
  if (total <= limit) return messages;

  const half = Math.floor(messages.length / 2);
  if (half === 0) return messages;

  const recent = messages.slice(half);
  const omitted = messages.slice(0, half);
  const omittedTokens = estimateMessagesTokens(omitted);
  const summary: CoreMessage = {
    role: "system",
    content: `[Summary of ${omitted.length} earlier messages (~${omittedTokens} tokens) omitted for context window. Key points preserved: conversation continued.]`,
  } as unknown as CoreMessage;

  return [{ role: summary.role as string, content: summary.content as string }, ...recent];
}
