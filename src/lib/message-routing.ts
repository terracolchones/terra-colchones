function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function isCatalogRequest(content: string): boolean {
  return /^(nueva demo|nueva demostracion|reiniciar(?: demo)?|empezar de nuevo|probar (?:de nuevo|otra vez)|ver producto otra vez|nuevo pedido|catalogo)$/i.test(normalize(content));
}

export function isGreeting(content: string): boolean {
  return /^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches)[!.\s]*$/i.test(normalize(content));
}

export function isProductIntent(content: string): boolean {
  const normalized = normalize(content);
  if (/\b(?:no|nada)\s+(?:es\s+)?(?:sobre\s+)?(?:producto|oferta|pedido|compra|catalogo)\b/i.test(normalized)) {
    return false;
  }
  return /\b(ver|quiero|deseo|hacer|realizar)?\s*(producto|oferta|pedido|comprar|compra|catalogo)\b/i.test(normalized);
}

/** Una solicitud explícita de atención humana nunca debe quedar detrás del CTA. */
export function requestsHumanSupport(content: string): boolean {
  return /\b(asesor(?:a)?|atencion\s+humana|persona\s+real|humano|humana|operador|representante)\b/i.test(normalize(content));
}

/** Información pública de Terra que puede responder el RAG, aun con un pedido activo. */
export function isPublicCompanyQuestion(content: string): boolean {
  const normalized = normalize(content);
  const companyTopic = /\b(sucursal(?:es)?|oficina(?:s)?|tienda(?:s)?|local(?:es)?|horario(?:s)?|atencion|contacto)\b/i;
  if (!companyTopic.test(normalized)) return false;
  return /[¿?]/.test(content)
    || /\b(donde|cual(?:es)?|como|cuando|quiero|quisiera|necesito|informacion|saber|atienden|abren|cierran)\b/i.test(normalized);
}

/** Mensajes sin una duda concreta: se pide la pregunta antes de reanudar el pedido. */
export function requestsGeneralInformation(content: string): boolean {
  const normalized = normalize(content);
  return /\b(?:quiero|quisiera|necesito|puedo)\b[\s\S]{0,48}\b(?:pregunta|consulta|informacion)\b/i.test(normalized)
    && !isKnowledgeQuestion(content)
    && !requestsHumanSupport(content);
}

/** Datos de ubicación o financieros concretos no se mandan al modelo. */
export function hasSensitiveCommerceData(content: string): boolean {
  if (isPublicCompanyQuestion(content)) return false;
  return /\b(gps|ubicacion|direccion|datos?\s+bancarios?|cuenta\s+bancaria|tarjeta)\b/i.test(normalize(content));
}

/** Estos pasos solo los resuelve el flujo controlado cuando existe un pedido. */
export function isControlledCheckoutTopic(content: string): boolean {
  if (isPublicCompanyQuestion(content)) return false;
  return /\b(gps|ubicacion|direccion|codigo\s+qr|qr|comprobante|transferencia|deposito|pago|pagos)\b/i.test(normalize(content));
}

/** Preguntas que deben llegar al RAG, aunque sean el primer mensaje o sean cortas. */
export function isKnowledgeQuestion(content: string): boolean {
  const normalized = normalize(content);
  if (/\b(cuanto|cuesta|precio|vale|costo|cotizacion|stock|disponible|disponibilidad|medida|medidas|tamano|material|garantia|entrega|envio|llega|demora|color|colores|modelo|caracteristica|especificacion|pago|comprobante|factura)\b/i.test(normalized)) {
    return true;
  }
  const mentionsProductCategory = /\b(colchon(?:es)?|somier(?:es)?|almohada(?:s)?|living|comedor(?:es)?|cocina(?:s)?|mueble(?:s)?)\b/i.test(normalized);
  if (mentionsProductCategory && (/[¿?]/.test(content) || /\b(venden|vende|tienen|tiene|hay|ofrecen|ofrece|disponen)\b/i.test(normalized))) {
    return true;
  }
  if (isPublicCompanyQuestion(content)) return true;
  return /[¿?]/.test(content) && /\b(que|cual|cuales|donde|cuando|como)\b/i.test(normalized);
}

/** Conserva el CTA comercial, sin convertir preguntas normales en un desvío. */
export function shouldSendCatalog(content: string, messageCountBefore: number): boolean {
  if (isCatalogRequest(content)) return true;
  if (requestsHumanSupport(content) || hasSensitiveCommerceData(content)) return false;
  if (isKnowledgeQuestion(content)) return false;
  return messageCountBefore === 0 || isGreeting(content) || isProductIntent(content);
}

/**
 * Evita que el modelo reactive pasos retirados de checkout, pero permite
 * respuestas seguras sobre políticas de pago o revisión de comprobantes.
 */
export function containsUnsafeCheckoutReply(content: string): boolean {
  const normalized = normalize(content);
  const requestsSensitiveStep = /\b(?:envia|envie|manda|comparte|solicita|pide|genera|escanea|usa|haz|indica|proporciona|facilita|deposita|transfiere|paga)\b[\s\S]{0,64}\b(?:tu\s+)?(?:gps|ubicacion|direccion|codigo\s+qr|qr|transferencia|comprobante|datos?\s+bancarios?|cuenta(?:\s+bancaria)?)\b/.test(normalized);
  const confirmsPayment = /\b(?:(?:tu|el|su)\s+)?(?:pago|comprobante)\s+(?:ya\s+)?(?:(?:esta|fue|ha\s+sido|queda)\s+)?(?:aprobado|confirmado|validado)\b/.test(normalized);
  return requestsSensitiveStep || confirmsPayment;
}
