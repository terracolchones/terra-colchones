export const HUMAN_HANDOFF_REPLY = "Perfecto, te conecto con un asesor comercial para ayudarte a avanzar.";
export const ADVISOR_CONFIRMATION_REPLY = "Ese detalle debe confirmarlo un asesor. Si prefieres, escribe “quiero hablar con un asesor” y te conectamos.";

/** Short, trusted copy for missing commercial evidence; it never transfers a chat. */
export function contextualAdvisorConfirmationReply(query = ""): string {
  const normalized = query.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
  const warranty = /\bgarantias?\b/.test(normalized);
  const shippingCost = /\b(?:envios?|entregas?|despacho)\b/.test(normalized)
    && /\b(?:costo|costos|cuesta|cuestan|precio|precios|tarifa|tarifas|cuanto|gratis|gratuito)\b/.test(normalized);
  if (warranty && !shippingCost) return "No tengo confirmada la garantía de ese producto. Un asesor puede ayudarte con ese dato.";
  if (shippingCost && !warranty) return "No tengo una tarifa de envío confirmada. Un asesor puede indicarte el costo.";
  return "No tengo ese dato confirmado. Un asesor puede ayudarte.";
}

/** Detecta la frase de derivación definida por el sistema para activar atención humana real. */
export function isHumanHandoffReply(content: string): boolean {
  return /\bte conecto\s+(?:con|a)\s+un(?:a)?\s+asesor(?:a)?\s+comercial\b/i.test(content);
}
