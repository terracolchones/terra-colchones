import { ADVISOR_NOTICE } from "./instructions";

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
export function withConversationGreeting(
  content: string,
  history: readonly GreetingMessage[],
  options: { includeAdvisorNotice?: boolean } = {},
): string {
  if (!content.trim()) return content;
  const greeting = /^[\s¡!👋😊]*(?:hola(?:\s+de\s+nuevo)?\b|buenos días\b|buenas (?:tardes|noches)\b)[!.,:;\s👋😊]*/iu;
  if (!shouldGreetForReply(history)) {
    const continued = content.replace(greeting, "").trimStart();
    // A model greeting must not restart an ongoing exchange or create an empty send.
    return continued.trim() ? continued : content;
  }
  if (history.length > 1) {
    // A returning customer already knows Terra; do not repeat the introduction.
    const resumed = greeting.test(content) ? content : "¡Hola! 👋\n\n" + content;
    return resumed.length <= 4096 ? resumed : content;
  }
  const body = content.replace(greeting, "")
    .replace(/^bienvenid[oa]s?\s+a\s+(?:importadora\s+)?terra\b[!.,\s]*/iu, "").trim();
  const identity = /\basistente virtual\b/iu.test(body.slice(0, 120))
    ? "¡Hola! 👋 Bienvenido a Terra."
    : "¡Hola! 👋 Bienvenido a Terra. Soy el asistente virtual de la tienda.";
  const normalizedBody = body.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const alreadyOffersAdvisor = /\b(?:escribe(?:me|nos)?|escriba(?:me|nos)?|escribir)\s+(?:(?:aqui|en este chat)\s+)?(?:(?:la\s+)?palabra\s+)?["'“”‘’«»]*asesor\b/iu.test(normalizedBody);
  const notice = options.includeAdvisorNotice !== false && !alreadyOffersAdvisor ? ADVISOR_NOTICE : "";
  const introduced = [identity, body, notice].filter(Boolean).join("\n\n");
  // Never truncate an approved map or overflow the provider's existing limit.
  return introduced.length <= 4096 ? introduced : content;
}
