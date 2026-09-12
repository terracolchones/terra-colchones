import { isKnowledgeQuestion } from "../message-routing";
import type { RetrievedSource } from "./core";

const DYNAMIC_CATALOG_FACT = /\b(precio|precios|cuanto|cuesta|vale|costo|cotizacion|stock|disponible|disponibilidad|medida|medidas|tamano|material|color|colores|modelo|caracteristica|especificacion)\b/i;
const PRICE_QUESTION = /\b(precio|precios|cuanto|cuesta|vale|costo|cotizacion)\b/i;
const PAYMENT_TOPIC = /\b(pago|pagos|pagar|comprobantes?|transferencias?|depositos?|efectivo|tarjeta|cuotas|contraentrega)\b/;
const DELIVERY_TOPIC = /\b(entregas?|envios?|despacho|llega|llegaria)\b/;

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
}

function evidence(sources: RetrievedSource[], topic: RegExp, detail: RegExp): boolean {
  return sources.some((source) => {
    if (source.kind !== "knowledge" && source.kind !== "catalog") return false;
    // A matching title or a one-word heading is not evidence of an approved policy.
    const content = normalize(source.content);
    return content.length >= 24 && topic.test(content) && detail.test(content);
  });
}

function isConcreteCommerceAction(query: string): boolean {
  return /\b(?:cancela|anula|cambia|modifica|devuelve|reembolsa|aprueba|valida)\b/.test(query)
    || /\b(?:quiero|necesito|deseo|solicito)\b[\s\S]{0,48}\b(?:cancelar|anular|cambiar|devolver|reembolso|cancelacion|devolucion|cambio)\b/.test(query)
    || /\b(?:cancelar|anular|cambiar|devolver|cancelacion|devolucion|reembolso|cambio)\b[\s\S]{0,36}\b(?:mi|este|ese)\s+(?:pedido|producto|compra|pago)\b/.test(query)
    || /\b(?:mi|este|ese)\s+(?:pedido|producto|compra)\b[\s\S]{0,36}\b(?:cancelado|cambiado|devuelto|reembolsado)\b/.test(query);
}

function isPaymentStatus(query: string): boolean {
  return PAYMENT_TOPIC.test(query) && (
    /\b(?:mi|mis|este|ese)\s+(?:pago|pagos|comprobante|transferencia|deposito)\b/.test(query)
    || /\b(?:ya pague|ya transferi|ya deposite|aprobado|confirmado|validado|acreditado|recibieron|revisaron|llego|estado)\b/.test(query)
  );
}

function hasPaymentPolicy(query: string, sources: RetrievedSource[]): boolean {
  if (/\bcomprobantes?\b/.test(query)) {
    return evidence(sources, /\bcomprobantes?\b/, /\b(?:revis(?:a|an|ion)|verific(?:a|an|acion)|equipo|asesor|imagen|adjuntar)\b/);
  }
  const requestedMethods = [
    /\b(?:al recibir|contra ?entrega|pago a la entrega)\b/,
    /\befectivo\b/, /\btransferencia\b/, /\bdeposito\b/, /\btarjeta\b/, /\bcuotas\b/, /\bqr\b/,
  ].filter((method) => method.test(query));
  const paymentMethods = /\b(?:efectivo|qr|transferencia|deposito|tarjetas?|cuotas|contra ?entrega|al recibir)\b/;
  return evidence(sources, paymentMethods, /\b(?:aceptamos|acepta|aceptan|admitimos|permitimos|permite|puedes|puede|realiza|realizan|realizar|pagar|pago|pagos|metodos|formas|disponible)\b/)
    && requestedMethods.every((method) => evidence(sources, method, /\b(?:aceptamos|acepta|aceptan|admitimos|permite|puedes|puede|pago|pagos|pagar|disponible)\b/));
}

/**
 * Decide sin depender del modelo cuándo un dato comercial requiere atención
 * humana. Las preguntas generales con una fuente aprobada siguen pudiendo
 * responderse por IA; los hechos dinámicos sin evidencia no.
 */
export function requiresHumanHandoffForQuery(query: string, sources: RetrievedSource[]): boolean {
  const normalizedQuery = normalize(query);
  if (isConcreteCommerceAction(normalizedQuery) || isPaymentStatus(normalizedQuery)) return true;
  const policyTopics = [
    { topic: /\bgarantias?\b/, detail: /\b(?:cubre|cobertura|incluye|aplica|defectos?|meses?|anos?|fabricacion|requiere)\b/ },
    { topic: /\bfacturas?\b/, detail: /\b(?:emitimos|emite|emiten|emitir|entregamos|entrega|incluye|incluyen|requiere|nombre|nit)\b/ },
    { topic: /\b(?:devoluciones?|devolucion|devolver)\b/, detail: /\b(?:acepta|aceptan|aceptamos|permite|permiten|plazo|dias?|condiciones|requiere|original|solicitar)\b/ },
    { topic: /\b(?:cambios?|cambiar)\b/, detail: /\b(?:acepta|aceptan|aceptamos|permite|permiten|plazo|dias?|condiciones|requiere|original|solicitar)\b/ },
    { topic: /\b(?:cancelaciones?|cancelacion|cancelar)\b/, detail: /\b(?:acepta|aceptan|permite|permiten|plazo|antes|despacho|requiere|solicitar)\b/ },
  ].filter(({ topic }) => topic.test(normalizedQuery));
  const paymentTopic = PAYMENT_TOPIC.test(normalizedQuery);
  if (!isKnowledgeQuestion(query) && policyTopics.length === 0 && !paymentTopic) return false;
  if (sources.length === 0) return true;
  if (policyTopics.some(({ topic, detail }) => !evidence(sources, topic, detail))) return true;
  if (paymentTopic && !hasPaymentPolicy(normalizedQuery, sources)) return true;

  if (DELIVERY_TOPIC.test(normalizedQuery)) {
    const exactCost = /\b(?:cuesta|costo|precio|tarifa|cuanto sale|cuanto cobran)\b/.test(normalizedQuery);
    const exactTime = /\b(?:cuando|fecha|hoy|manana|demora|tarda|llega|llegaria|plazo)\b/.test(normalizedQuery);
    if ((exactCost || exactTime) && /\b(?:mi pedido|mi entrega|mi envio|a mi casa)\b/.test(normalizedQuery)) return true;
    if (exactCost && !evidence(sources, DELIVERY_TOPIC, /(?:\bbs\.?\s*\d|\d[\d.,]*\s*bolivianos?\b|\bgratis|\bgratuit[oa]|\bsin costo)/)) return true;
    if (exactTime && !evidence(sources, DELIVERY_TOPIC, /\b(?:\d+\s*(?:a\s*\d+\s*)?(?:horas?|dias?|semanas?)|lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)\b/)) return true;
    // Shipping tariffs are approved knowledge, not product catalog prices.
    if ((exactCost || exactTime) && !/\b(?:colchon|sillon|producto|somier|modelo)\b/.test(normalizedQuery)) return false;
  }

  // Duration/conditions of a policy are not a product price query.
  if ((policyTopics.length > 0 || paymentTopic) && !/\b(?:precio|precios|cuesta|vale|costo|cotizacion|stock|disponibilidad|medidas?|material|colores?|modelo)\b/.test(normalizedQuery)) return false;
  if (!DYNAMIC_CATALOG_FACT.test(normalizedQuery)) return false;

  const catalogSources = sources.filter((source) => source.kind === "catalog");
  if (catalogSources.length === 0) return true;
  if (PRICE_QUESTION.test(normalizedQuery)) {
    const selectedVariants = catalogSources.filter((source) => /^Variante seleccionada:/m.test(source.content));
    const priceSources = selectedVariants.length > 0 ? selectedVariants : catalogSources;
    return !priceSources.some((source) => /^Precio vigente: Bs \d/m.test(source.content));
  }
  return false;
}
