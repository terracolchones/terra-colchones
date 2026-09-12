import type { Message } from "@/lib/db";

/** Minimización antes de recuperar fuentes y antes de entregar historial al modelo. */
export function sanitizeConversationText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "[enlace omitido]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[identificador omitido]")
    .replace(/\bT-[A-Z0-9]{4}-[A-Z0-9]{4}\b/gi, "[pedido]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[correo omitido]")
    .replace(/-?\d{1,3}\.\d{4,}\s*[,;]\s*-?\d{1,3}\.\d{4,}/g, "[coordenadas omitidas]")
    .replace(/(?:\+?\d[\s().-]*){7,}/g, "[número privado omitido] ")
    .replace(/\b(?:mi (?:direcci[oó]n|ubicaci[oó]n|domicilio)|vivo en|resido en|(?:mi )?cuenta bancaria|(?:mi )?n[uú]mero de tarjeta)\s*(?:es|:)?[^\n!?;]*/gi, "[dato privado omitido]")
    .slice(0, 3000);
}

export function sanitizeHistory(history: Message[]): Message[] {
  return history.slice(-20)
    .filter((message) => message.role === "user" || !/(?:thinking process|reasoning process|<think>|analyze user input|formulate response)/i.test(message.content))
    .map((message) => ({ ...message, content: sanitizeConversationText(message.content) }));
}
