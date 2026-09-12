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
      [source("catalog", "Variante seleccionada: Especial\nPrecio de la variante seleccionada: sin precio publicado."),
        source("catalog", "Nombre: Otro producto\nPrecio vigente: Bs 2.099")],
    )).toBe(true);
  });

  it("permite la política general de entrega, pero deriva una fecha o costo exacto", () => {
    const delivery = [source("knowledge", "Terra realiza entregas en Santa Cruz y envíos a Bolivia.")];
    expect(requiresHumanHandoffForQuery("¿Hacen envíos?", delivery)).toBe(false);
    expect(requiresHumanHandoffForQuery("¿Cuánto cuesta el envío?", delivery)).toBe(true);
  });

  it("una fuente genérica no acredita una política ni el estado de un pago", () => {
    expect(requiresHumanHandoffForQuery("¿Qué garantía tiene?", [source("knowledge", "Política")])).toBe(true);
    expect(requiresHumanHandoffForQuery("¿Mi pago está aprobado?", [source("knowledge", "Comprobante en revisión")])).toBe(true);
  });

  it("permite explicar garantías, facturación y condiciones generales aprobadas", () => {
    const cases = [
      ["¿Qué garantía tiene?", "La garantía cubre defectos de fabricación durante 12 meses."],
      ["¿Cuánto dura la garantía?", "La garantía cubre defectos de fabricación durante 12 meses."],
      ["¿Emiten factura?", "Emitimos factura por cada compra y se requiere el nombre para su emisión."],
      ["¿Cuál es la política de cambios?", "Los cambios se permiten durante 5 días con el empaque original."],
      ["¿Cuál es la política de devolución?", "Las devoluciones se permiten durante 5 días con el empaque original."],
      ["¿Qué política de cancelación tienen?", "La cancelación se debe solicitar antes del despacho para su revisión."],
    ];
    for (const [query, content] of cases) {
      expect(requiresHumanHandoffForQuery(query, [source("knowledge", content)]), query).toBe(false);
      expect(requiresHumanHandoffForQuery(query, [source("knowledge", "Política comercial aprobada de la empresa")]), query).toBe(true);
    }
  });

  it("una política permite explicar condiciones, pero no ejecutar cancelaciones ni validar un pago", () => {
    const approved = [source("knowledge", "La cancelación se permite antes del despacho. Los cambios se permiten durante 5 días. El equipo revisa comprobantes. Aceptamos pagos por transferencia.")];
    for (const query of [
      "Quiero cancelar mi pedido", "¿Puedo cambiar este producto?", "Cancela el pedido", "¿Mi pago está aprobado?",
      "¿Ya revisaron el comprobante?", "Aprueba el pago", "¿Cuál es el estado de mi transferencia?",
    ]) expect(requiresHumanHandoffForQuery(query, approved), query).toBe(true);
  });

  it("distingue métodos de pago de estado y exige evidencia del método solicitado", () => {
    const methods = [source("knowledge", "Aceptamos pagos por transferencia bancaria y efectivo. No aceptamos pago al recibir.")];
    expect(requiresHumanHandoffForQuery("¿Qué formas de pago aceptan?", methods)).toBe(false);
    expect(requiresHumanHandoffForQuery("¿Puedo pagar al recibir?", methods)).toBe(false);
    expect(requiresHumanHandoffForQuery("¿Puedo pagar con tarjeta?", methods)).toBe(true);
    expect(requiresHumanHandoffForQuery("¿Qué formas de pago aceptan?", [source("knowledge", "Información general de Terra y su catálogo.")])).toBe(true);
    expect(requiresHumanHandoffForQuery("¿Cómo se revisan los comprobantes?", [source("knowledge", "El equipo revisa los comprobantes recibidos antes de confirmar el pago.")])).toBe(false);
  });

  it("permite un importe o plazo publicado de entrega sin confirmar un envío individual", () => {
    const delivery = [source("knowledge", "El envío tiene un costo de Bs 25 en la zona indicada. La entrega demora de 2 a 3 días.")];
    expect(requiresHumanHandoffForQuery("¿Cuánto cuesta el envío?", delivery)).toBe(false);
    expect(requiresHumanHandoffForQuery("¿Cuánto demora la entrega?", delivery)).toBe(false);
    expect(requiresHumanHandoffForQuery("¿Cuándo llega mi pedido?", delivery)).toBe(true);
    expect(requiresHumanHandoffForQuery("¿Cuánto cuesta el envío?", [source("knowledge", "La entrega demora de 2 a 3 días.")])).toBe(true);
    expect(requiresHumanHandoffForQuery("¿Cuánto demora la entrega?", [source("knowledge", "El envío tiene un costo de Bs 25 en la zona indicada.")])).toBe(true);
  });
});
