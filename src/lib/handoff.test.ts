import { describe, expect, it } from "vitest";
import { contextualAdvisorConfirmationReply, isHumanHandoffReply } from "./handoff";

describe("contextual missing-evidence copy", () => {
  it.each([
    ["Tiene garantia sus productos?", "No tengo confirmada la garantía de ese producto. Un asesor puede ayudarte con ese dato."],
    ["¿Qué garantía tiene?", "No tengo confirmada la garantía de ese producto. Un asesor puede ayudarte con ese dato."],
    ["quiero hacer un pedido el envio tiene costo?", "No tengo una tarifa de envío confirmada. Un asesor puede indicarte el costo."],
    ["¿La entrega es gratis?", "No tengo una tarifa de envío confirmada. Un asesor puede indicarte el costo."],
    ["¿Qué garantía tiene y cuánto cuesta el envío?", "No tengo ese dato confirmado. Un asesor puede ayudarte."],
    ["¿Tienen facturas?", "No tengo ese dato confirmado. Un asesor puede ayudarte."],
  ])("keeps the fallback relevant and brief for %s", (query, expected) => {
    const result = contextualAdvisorConfirmationReply(query);
    expect(result).toBe(expected);
    expect(result).not.toContain("escribe");
    expect(result).not.toMatch(/gratis|\d|gps|qr|confirmamos|te conect/i);
    expect(isHumanHandoffReply(result)).toBe(false);
  });
});
