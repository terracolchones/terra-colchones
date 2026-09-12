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
  // Recognize common short greeting typos, without swallowing a following question.
  return /^(hola(?:a|c)?|holi|buenas|buenos dias|buenas tardes|buenas noches)(?:\s+terra)?[!.\s]*$/i.test(normalize(content));
}

export function isProductIntent(content: string): boolean {
  const normalized = normalize(content);
  if (/\b(?:no|nada)\s+(?:es\s+)?(?:sobre\s+)?(?:producto|oferta|pedido|compra|catalogo)\b/i.test(normalized)
    || /\bno\s+(?:quiero|deseo|busco|puedo|he decidido|decidi)\b/.test(normalized)
    || /\bno\s+(?:estoy|estamos|me siento)\s+(?:list[oa]s?|segur[oa]s?|decidid[oa]s?)\b/.test(normalized)
    || /\b(?:prefiero|quiero|voy a|lo voy a)\s+(?:pensar(?:lo)?|esperar)\b/.test(normalized)
    || /\bsolo\s+(?:estoy\s+)?(?:mirando|comparando|averiguando)\b/.test(normalized)) {
    // Posponer o expresar dudas sobre comprar no solicita abrir el catálogo.
    // Una solicitud directa de catálogo se resuelve antes en shouldSendCatalog.
    return false;
  }
  return /\b(ver|quiero|deseo|hacer|realizar)?\s*(producto|oferta|pedido|comprar|compra|catalogo)\b/i.test(normalized);
}

/** Una solicitud explícita de atención humana nunca debe quedar detrás del CTA. */
export function requestsHumanSupport(content: string): boolean {
  const value = normalize(content);
  const person = "(?:asesor(?:a)?|atencion humana|persona(?: real)?|humano|humana|operador(?:a)?|representante|alguien (?:de la tienda|del equipo))";
  const recipient = `(?:(?:un|una|el|la)\\s+)?${person}\\b`;
  if (new RegExp(`^(?:por favor[,]?\\s+)?${recipient}(?:\\s+por favor)?[.!\\s]*$`).test(value)) return true;
  const desire = "(?:quiero|quisiera|necesito|prefiero|deseo|me gustaria)";
  const contact = "(?:hablar|comunicarme|contactar|contactarme|conversar)";
  const requests = [
    `\\b${desire}\\s+${recipient}`,
    `\\b(?:${desire}|puedo|podria)\\s+(?:poder\\s+)?${contact}\\s+(?:con\\s+)?${recipient}`,
    `\\b(?:conectame|pasame|derivame|comunicame|transfiereme)\\s+(?:(?:con|a)\\s+)?${recipient}`,
    `\\b${desire}\\s+que\\s+(?:me\\s+(?:atienda|ayude|contacte)\\s+${recipient}|${recipient}\\s+me\\s+(?:atienda|ayude|contacte))`,
    `\\b(?:puede|podria)\\s+${recipient}\\s+(?:atenderme|ayudarme|contactarme|hablar conmigo)`,
    `^(?:por favor\\s+)?(?:${contact}\\s+con|que me (?:atienda|ayude))\\s+${recipient}`,
  ].map((pattern) => new RegExp(pattern));
  // Una mención informativa no es consentimiento. Las negaciones, hipótesis y
  // citas se evalúan en la cláusula del pedido, no por una palabra aislada.
  return value.split(/[.!?;,]|\bpero\b/).some((clause) => {
    return requests.some((request) => {
      const match = request.exec(clause.trim());
      if (!match) return false;
      const prefix = clause.trim().slice(0, match.index);
      if (/\b(?:no|nunca|tampoco|sin)\s*(?:yo\s*)?$/.test(prefix)) return false;
      if (/\bno\s+(?:se\s+si|estoy\s+pidiendo|estoy\s+solicitando|estoy\s+diciendo\s+que|he\s+pedido|he\s+solicitado)\b[\s\S]*$/.test(prefix)) return false;
      const asksContactAvailability = /\b(?:quiero|quisiera|necesito|me gustaria)\s+saber\s+si\s*$/.test(prefix)
        && !/\b(?:no|nunca|tampoco)\s+(?:quiero|quisiera|necesito|me gustaria)\b/.test(prefix);
      if (/\b(?:si|cuando|en caso de que)\s+(?:yo\s+)?$/.test(prefix) && !asksContactAvailability) return false;
      if (/\b(?:me\s+)?(?:dijo|dijeron|decia|escribio|pregunto|preguntaron)\b[\s\S]*$/.test(prefix)) return false;
      return true;
    });
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
  // «Sí», «listo» o «perfecto» pueden contestar una pregunta comercial pendiente.
  // Solo un agradecimiento inequívoco usa el cierre breve sin consultar historial.
  return /^(?:(?:muchas |muchisimas |mil )?gracias(?: por (?:todo|la ayuda|la informacion))?)[!.\s]*$/.test(normalize(content));
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
  // Una ubicación pública de la tienda se responde con su fuente, sin reactivar el GPS del pedido.
  if (isPublicDirectoryQuestion(content)) return false;
  return /^(?:ubicacion|gps|qr|comprobante|pago)[!.\s]*$/.test(value)
    || /\b(?:ya pague|ya hice (?:el pago|la transferencia)|ya envie (?:el )?comprobante)\b/.test(value)
    || (/\b(?:no (?:me )?(?:llego|recibi|veo)|reenviar|reenvia|enviame|mandame)\b/.test(value)
      && /\b(?:qr|gps|ubicacion|comprobante|pago)\b/.test(value));
}

function hasConcreteContactData(content: string): boolean {
  return /(?:\d[\s().-]*){7,}|https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|-?\d{1,3}\.\d{3,}\s*[,;]\s*-?\d{1,3}\.\d{3,}/i.test(content);
}

function mentionsPrivateCommerceData(value: string): boolean {
  return /\b(?:mi|mis)\s+(?:(?:nuevo|nueva|nuevos|nuevas)\s+)?(?:numeros?|telefonos?|celular(?:es)?|contactos?|tarjetas?|direccion(?:es)?|ubicacion(?:es)?|domicilios?|coordenadas?|gps|cuenta(?:\s+bancaria)?|datos?\s+bancarios?)\b/.test(value)
    || /\b(?:numeros?|codigos?)\s+(?:(?:de|del)\s+)?(?:(?:mi|mis|tu|tus|la|el|un|una)\s+)?(?:tarjeta|cuenta|pedido|comprobante|transferencia|deposito|documento|identidad|carnet|cedula|casa)\b/.test(value)
    || /\b(?:datos?|direccion(?:es)?|ubicacion(?:es)?|coordenadas?|gps)\s+(?:de|del|para)\s+(?:(?:mi|mis|tu|tus|el|la|los|las|un|una)\s+)?(?:pedido|compra|pago|comprobante|cuenta|tarjeta|cliente|clientes|casa|domicilio)\b/.test(value)
    || /\b(?:direccion(?:es)?|ubicacion(?:es)?|coordenadas?|gps)\s+(?:de|del)\s+(?:(?:la|el|mi)\s+)?(?:entrega|envio)\b/.test(value)
    || /\b(?:vivo|resido)\s+en\b/.test(value)
    || /\b(?:cvv|pin|datos?\s+bancarios?|cuenta\s+bancaria)\b/.test(value);
}

function hasExplicitPaymentAction(value: string): boolean {
  return /\b(?:ya pague|ya hice (?:el pago|la transferencia)|ya envie (?:el )?comprobante)\b/.test(value)
    || /\b(?:enviame|mandame|reenvia|reenviar|dame)\s+(?:(?:el|un|mi)\s+)?(?:qr|comprobante|pago)\b/.test(value)
    || /\bno (?:me )?(?:llego|recibi|veo)\s+(?:(?:el|mi)\s+)?(?:qr|comprobante|pago)\b/.test(value);
}

/** Solicita un contacto comercial; los nombres y teléfonos deben validarse en fuentes publicadas. */
export function isPublicContactQuestion(content: string): boolean {
  const value = normalize(content);
  if (hasConcreteContactData(content) || mentionsPrivateCommerceData(value)) return false;
  const contactTopic = /\b(?:numeros?|telefonos?|celular(?:es)?|contactos?|whatsapp)\b/;
  if (!contactTopic.test(value)) return false;
  return /[¿?]/.test(content)
    || /\b(?:dame|pasame|enviame|mandame|comparteme|quiero|quisiera|necesito|cual(?:es)?|tienen|tienes|saber|informacion|me das|me da|me pueden dar)\b/.test(value)
    || /^(?:(?:y|el|la|los|las|su|sus|un|una)\s+)*(?:numeros?|telefonos?|celular(?:es)?|contactos?|whatsapp)\b/.test(value);
}

/** Consultas sobre sucursales y sus datos públicos, sin depender del nombre de una ciudad. */
export function isPublicDirectoryQuestion(content: string): boolean {
  const value = normalize(content);
  if (hasConcreteContactData(content) || mentionsPrivateCommerceData(value) || hasExplicitPaymentAction(value)) return false;
  if (isPublicContactQuestion(content)) return true;
  const branch = /\b(?:sucursal(?:es)?|oficina(?:s)?|tienda(?:s)?|local(?:es)?|sede(?:s)?)\b/.test(value);
  const location = /\b(?:direccion(?:es)?|ubicacion(?:es)?|mapas?|gps|coordenadas?)\b/.test(value);
  const hours = /\bhorarios?\b/.test(value);
  const companyReference = /\b(?:su|sus|tu|tus|vuestra|vuestras|de terra|de la tienda|del local)\b/.test(value);
  const locationTarget = /\b(?:direccion(?:es)?|ubicacion(?:es)?|mapas?|gps|coordenadas?|datos?)\s+(?:de|del|en|para)\s+\p{L}/u.test(value);
  const request = /[¿?]/.test(content)
    || /\b(?:dame|pasame|enviame|mandame|comparteme|muestrame|quiero|quisiera|necesito|cual(?:es)?|donde|como|saber|informacion|me das|me da|me pueden dar)\b/.test(value);
  const allLocations = /\b(?:direcciones|ubicaciones|mapas|sucursales|oficinas|sedes)\b/.test(value);
  const askingWhere = /\b(?:donde (?:estan|se encuentran|quedan)|como (?:llego|llegar))\b/.test(value);
  const directoryDetails = /\bdatos?\b/.test(value) && (branch || companyReference || locationTarget);
  const locationLabel = /^(?:(?:y|el|la|los|las|su|sus|tu|tus)\s+)*(?:direccion(?:es)?|ubicacion(?:es)?|mapas?|gps|coordenadas?)\b/.test(value);
  if (askingWhere && !/\b(?:pedido|compra|pago|producto|productos)\b/.test(value)) return true;
  if (directoryDetails && request) return true;
  if (/\bdireccion(?:es)?\b/.test(value) && request) return true;
  if (location && (branch || companyReference || locationTarget || allLocations) && (request || locationLabel)) return true;
  if ((branch || hours) && request) return true;
  return /^(?:(?:y|el|la|los|las|su|sus|tus|todas|todos)\s+)*(?:direcciones|ubicaciones|mapas?|sucursal(?:es)?|oficinas?|horarios?)(?:\s+(?:de|del|en)\s+\p{L}.*)?[.!\s]*$/u.test(value);
}

/** Información pública de Terra que puede responder el RAG, aun con un pedido activo. */
export function isPublicCompanyQuestion(content: string): boolean {
  const normalized = normalize(content);
  if (hasConcreteContactData(content) || mentionsPrivateCommerceData(normalized) || hasExplicitPaymentAction(normalized)) return false;
  if (isPublicDirectoryQuestion(content)) return true;
  if (/\b(?:su|sus|vuestra|de terra|de la tienda|del local)\b/.test(normalized)
    && /\b(?:direccion|ubicacion)\b/.test(normalized)
    && isCheckoutInformationQuestion(content)) return true;
  const companyTopic = /\b(sucursal(?:es)?|oficina(?:s)?|tienda(?:s)?|local(?:es)?|horario(?:s)?|atencion|contacto)\b/i;
  if (!companyTopic.test(normalized)) return false;
  return /[¿?]/.test(content)
    || /\b(donde|cual(?:es)?|como|cuando|dame|pasame|enviame|quiero|quisiera|necesito|informacion|saber|atienden|abren|cierran)\b/i.test(normalized);
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
  if (hasConcreteContactData(content)) return true;
  const value = normalize(content);
  if (mentionsPrivateCommerceData(value)) return true;
  if (isPublicCompanyQuestion(content)) return false;
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
