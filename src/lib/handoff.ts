export const HUMAN_HANDOFF_REPLY = "Perfecto, te conecto con un asesor comercial para ayudarte a avanzar.";

/** Detecta la frase de derivación definida por el sistema para activar atención humana real. */
export function isHumanHandoffReply(content: string): boolean {
  return /\bte conecto\s+(?:con|a)\s+un(?:a)?\s+asesor(?:a)?\s+comercial\b/i.test(content);
}
