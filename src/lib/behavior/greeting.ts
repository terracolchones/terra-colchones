type GreetingMessage = { role: string; content: string; created_at?: number };

// Conversational choice, in seconds (the message store uses Unix timestamps).
export const GREETING_RESUME_SECONDS = 30 * 60;

export function shouldGreetForReply(history: readonly GreetingMessage[]): boolean {
  const last = history.at(-1);
  if (!last || last.role !== "user") return false;
  const previous = history.at(-2);
  if (!previous) return true;
  return typeof last.created_at === "number" && Number.isFinite(last.created_at)
    && typeof previous.created_at === "number" && Number.isFinite(previous.created_at)
    && last.created_at - previous.created_at >= GREETING_RESUME_SECONDS;
}

/** Decorate the existing reply; never schedule or send an additional message. */
export function withConversationGreeting(content: string, history: readonly GreetingMessage[]): string {
  const alreadyGreets = /^[\s¡!👋😊]*(?:hola\b|buenos días\b|buenas (?:tardes|noches)\b)/iu.test(content);
  const prefix = "¡Hola! 👋\n\n";
  // Do not truncate an approved map or overflow the provider's existing limit.
  if (!content.trim() || alreadyGreets || !shouldGreetForReply(history) || content.length + prefix.length > 4096) return content;
  return prefix + content;
}
