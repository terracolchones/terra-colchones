import { describe, expect, it } from "vitest";
import type { RetrievedSource } from "./core";
import { requiresHumanHandoffForQuery } from "./policy";

function source(kind: RetrievedSource["kind"], content: string): RetrievedSource {
  return { id: kind, kind, label: kind, content, score: 1 };
}

describe("política de derivación RAG", () => {
  it("deriva una consulta de precio cuando no hay evidencia del catálogo", () => {
    expect(requiresHumanHandoffForQuery("¿Cuánto cuesta?", [source("knowledge", "Política comercial")])).toBe(true);
  });

  it("permite responder un precio respaldado por el catálogo", () => {
    expect(requiresHumanHandoffForQuery(
      "¿Cuánto cuesta el sillón?",
      [source("catalog", "Nombre: Sillón\nPrecio vigente: Bs 2.099")],
    )).toBe(false);
  });

  it("deriva una variante sin precio publicado", () => {
    expect(requiresHumanHandoffForQuery(
      "¿Cuál es el precio de esta variante?",
      [source("catalog", "Variante seleccionada: Especial\nPrecio de la variante seleccionada: sin precio publicado.")],
    )).toBe(true);
  });

  it("permite la política general de entrega, pero deriva una fecha o costo exacto", () => {
    const delivery = [source("knowledge", "Terra realiza entregas en Santa Cruz y envíos a Bolivia.")];
    expect(requiresHumanHandoffForQuery("¿Hacen envíos?", delivery)).toBe(false);
    expect(requiresHumanHandoffForQuery("¿Cuánto cuesta el envío?", delivery)).toBe(true);
  });

  it("deriva garantías y otras políticas que necesitan confirmación humana", () => {
    expect(requiresHumanHandoffForQuery("¿Qué garantía tiene?", [source("knowledge", "Política")])).toBe(true);
    expect(requiresHumanHandoffForQuery("¿Mi pago está aprobado?", [source("knowledge", "Comprobante en revisión")])).toBe(true);
  });
});
