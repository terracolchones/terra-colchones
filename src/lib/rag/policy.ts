import { isKnowledgeQuestion } from "../message-routing";
import type { RetrievedSource } from "./core";

const DYNAMIC_CATALOG_FACT = /\b(precio|precios|cuanto|cuesta|vale|costo|cotizacion|stock|disponible|disponibilidad|medida|medidas|tamano|material|color|colores|modelo|caracteristica|especificacion)\b/i;
const PRICE_QUESTION = /\b(precio|precios|cuanto|cuesta|vale|costo|cotizacion)\b/i;
const HUMAN_ONLY_POLICY = /\b(garantia|devolucion|factura|cambio|cancelacion)\b/i;
const PAYMENT_OR_PROOF = /\b(pago|pagos|comprobante|transferencia|deposito)\b/i;
const EXACT_DELIVERY = /(?:\b(cuando|fecha|hoy|manana|demora|llega|cuanto|costo|precio|tarifa|cubre|cobertura)\b[\s\S]{0,48}\b(entrega|envio|despacho)\b|\b(entrega|envio|despacho)\b[\s\S]{0,48}\b(cuando|fecha|hoy|manana|demora|llega|cuanto|costo|precio|tarifa|cubre|cobertura)\b)/i;

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
}

/**
 * Decide sin depender del modelo cuándo un dato comercial requiere atención
 * humana. Las preguntas generales con una fuente aprobada siguen pudiendo
 * responderse por IA; los hechos dinámicos sin evidencia no.
 */
export function requiresHumanHandoffForQuery(query: string, sources: RetrievedSource[]): boolean {
  if (!isKnowledgeQuestion(query)) return false;
  if (sources.length === 0) return true;
  const normalizedQuery = normalize(query);
  if (HUMAN_ONLY_POLICY.test(normalizedQuery) || PAYMENT_OR_PROOF.test(normalizedQuery) || EXACT_DELIVERY.test(normalizedQuery)) return true;
  if (!DYNAMIC_CATALOG_FACT.test(normalizedQuery)) return false;

  const catalogSources = sources.filter((source) => source.kind === "catalog");
  if (catalogSources.length === 0) return true;
  if (PRICE_QUESTION.test(normalizedQuery)) {
    return !catalogSources.some((source) => /^Precio vigente: Bs /m.test(source.content));
  }
  return false;
}
