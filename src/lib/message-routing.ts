function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function isCatalogRequest(content: string): boolean {
  return /^(nueva demo|nueva demostracion|reiniciar(?: demo)?|empezar de nuevo|probar (?:de nuevo|otra vez)|ver producto otra vez|(?:quiero (?:hacer )?)?(?:un )?nuevo pedido|(?:ver |quiero ver (?:el )?)?catalogo)[.!\s]*$/i.test(normalize(content));
}

export function isGreeting(content: string): boolean {
  return /^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches)[!.\s]*$/i.test(normalize(content));
}

export function isProductIntent(content: string): boolean {
  const normalized = normalize(content);
  if (/\b(?:no|nada)\s+(?:es\s+)?(?:sobre\s+)?(?:producto|oferta|pedido|compra|catalogo)\b/i.test(normalized)
    || /\bno\s+(?:quiero|deseo|busco)\b/.test(normalized)) {
    return false;
  }
  return /\b(ver|quiero|deseo|hacer|realizar)?\s*(producto|oferta|pedido|comprar|compra|catalogo)\b/i.test(normalized);
}

/** Una solicitud explícita de atención humana nunca debe quedar detrás del CTA. */
export function requestsHumanSupport(content: string): boolean {
  const value = normalize(content);
  const person = "(?:asesor(?:a)?|atencion humana|persona real|humano|humana|operador|representante)";
  if (new RegExp(`^(?:un |una )?${person}[.!\\s]*$`).test(value)) return true;
  // Cada cláusula conserva su negación. Preguntar por identidad no solicita transferencia.
  return value.split(/[.!?;,]|\bpero\b/).some((clause) => {
    const match = new RegExp(`\\b(?:quiero|quisiera|necesito|prefiero|puedo|podria|hablar|hablo|hablarme|comunicarme|conectame|pasame|derivame|contactar|contactarme|atienda|atenderme)\\b[\\s\\S]{0,80}\\b${person}\\b`).exec(clause);
    if (!match || /\b(?:saber|eres|sos|dijo|significa|es un|es una)\b/.test(match[0])) return false;
    return !/\b(?:no|sin|nunca|no se si)\s*$/.test(clause.slice(0, match.index));
  });
}

/** Solo el mensaje afirmativo de confirmación vincula un código a un chat. */
export function isOrderConfirmationRequest(content: string): boolean {
  return /^(?:hola(?: terra)?[,!.\s]*)?confirmo\s+(?:mi |el )?pedido\s*#?t-[a-z0-9]{4}-[a-z0-9]{4}[!.\s]*$/i.test(normalize(content));
}

export function isIdentityQuestion(content: string): boolean {
  return /\b(?:eres|sos|es usted)\b[\s\S]{0,24}\b(?:humano|humana|bot|robot|ia|inteligencia artificial|persona)\b/.test(normalize(content));
}

export function declinesHumanSupport(content: string): boolean {
  return /\b(?:no quiero|no necesito|sin)\b[\s\S]{0,40}\b(?:asesor|asesora|humano|humana|operador)\b/.test(normalize(content));
}

export function isAcknowledgment(content: string): boolean {
  return /^(?:(?:muchas |muchisimas |mil )?gracias(?: por (?:todo|la ayuda|la informacion))?|ok(?:ay)?|esta bien|entendido|perfecto|listo|de acuerdo|dale|vale|bien|si)[!.\s]*$/.test(normalize(content));
}

export function requestsOrderChange(content: string): boolean {
  return /\b(?:(?:quiero|necesito|deseo)\s+(?:cancelar|anular|cambiar|modificar)|cancela|anula|modifica|cambia)\b/.test(normalize(content))
    && !/\b(?:no quiero|no necesito|sin)\s+(?:cancelar|cambiar|modificar|anular)\b/.test(normalize(content));
}

export function isCheckoutInformationQuestion(content: string): boolean {
  return /[¿?]/.test(content) || /\b(?:como|cual(?:es)?|cuanto|cuando|por que|puedo|aceptan|formas de|metodos de|garantia|politica)\b/.test(normalize(content));
}

export function requestsCheckoutAction(content: string): boolean {
  const value = normalize(content);
  return /^(?:ubicacion|gps|qr|comprobante|pago)[!.\s]*$/.test(value)
    || /\b(?:ya pague|ya hice (?:el pago|la transferencia)|ya envie (?:el )?comprobante)\b/.test(value)
    || (/\b(?:no (?:me )?(?:llego|recibi|veo)|reenviar|reenvia|enviame|mandame)\b/.test(value)
      && /\b(?:qr|gps|ubicacion|comprobante|pago)\b/.test(value));
}

/** Información pública de Terra que puede responder el RAG, aun con un pedido activo. */
export function isPublicCompanyQuestion(content: string): boolean {
  const normalized = normalize(content);
  if (/\b(?:su|sus|vuestra|de terra|de la tienda|del local)\b/.test(normalized)
    && /\b(?:direccion|ubicacion)\b/.test(normalized)
    && isCheckoutInformationQuestion(content)) return true;
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
  // Los datos concretos se protegen incluso si el mismo mensaje incluye una duda pública.
  if (/(?:\d[\s().-]*){7,}|https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(content)) return true;
  if (isPublicCompanyQuestion(content)) return false;
  const value = normalize(content);
  if (/\b(?:mi|mis)\s+(?:tarjeta|datos? bancarios?|cuenta bancaria)\b|\b(?:numero|codigo|cvv|pin)\b/.test(value)) return true;
  if (isCheckoutInformationQuestion(content) && /\b(?:aceptan|pagar|formas de pago|metodos de pago)\b/.test(value)
    && !/\b(?:gps|ubicacion|direccion)\b/.test(value)) return false;
  return /\b(gps|ubicacion|direccion|datos?\s+bancarios?|cuenta\s+bancaria|tarjeta)\b/i.test(value);
}

/** Estos pasos solo los resuelve el flujo controlado cuando existe un pedido. */
export function isControlledCheckoutTopic(content: string): boolean {
  if (isPublicCompanyQuestion(content)) return false;
  if (isCheckoutInformationQuestion(content) && !requestsCheckoutAction(content)) return false;
  return /\b(gps|ubicacion|direccion|codigo\s+qr|qr|comprobante|transferencia|deposito|pago|pagos)\b/i.test(normalize(content));
}

/** Preguntas que deben llegar al RAG, aunque sean el primer mensaje o sean cortas. */
export function isKnowledgeQuestion(content: string): boolean {
  const normalized = normalize(content);
  if (/\b(cuanto|cuesta|precio|vale|costo|cotizacion|stock|disponible|disponibilidad|medida|medidas|tamano|material|garantia|entrega|envio|llega|demora|color|colores|modelo|caracteristica|especificacion|pago|pagar|comprobante|factura)\b/i.test(normalized)) {
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
export function shouldSendCatalog(content: string, _messageCountBefore: number): boolean {
  // Compatibilidad con los llamadores existentes: ser el primer mensaje no implica compra.
  void _messageCountBefore;
  if (isCatalogRequest(content)) return true;
  if (requestsHumanSupport(content) || hasSensitiveCommerceData(content)) return false;
  if (isKnowledgeQuestion(content)) return false;
  return isGreeting(content) || isProductIntent(content);
}

/**
 * Evita que el modelo reactive pasos retirados de checkout, pero permite
 * respuestas seguras sobre políticas de pago o revisión de comprobantes.
 */
export function containsUnsafeCheckoutReply(content: string): boolean {
  const normalized = normalize(content);
  const requestsSensitiveStep = /\b(?:envia|envie|manda|comparte|solicita|pide|genera|escanea|usa|haz|indica|proporciona|facilita|deposita|transfiere|paga)\b[\s\S]{0,64}\b(?:tu\s+)?(?:gps|ubicacion|direccion|codigo\s+qr|qr|transferencia|comprobante|datos?\s+bancarios?|cuenta(?:\s+bancaria)?)\b/.test(normalized);
  const confirmsPayment = /\b(?:(?:tu|el|su)\s+)?(?:pago|comprobante)\s+(?:ya\s+)?(?:(?:esta|fue|ha\s+sido|queda)\s+)?(?:aprobado|confirmado|validado)\b/.test(normalized);
  const claimsOrderAction = /\b(?:pedido|compra|reserva|devolucion)\b[\s\S]{0,30}\b(?:cancelad[oa]|anulad[oa]|modificad[oa]|despachad[oa]|reembolsad[oa])\b/.test(normalized)
    || /\b(?:ya )?(?:cancele|anule|modifique|despachamos|reembolsamos)\b/.test(normalized);
  return requestsSensitiveStep || confirmsPayment || claimsOrderAction;
}
