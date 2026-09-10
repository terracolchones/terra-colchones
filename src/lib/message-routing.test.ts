import { describe, expect, it } from "vitest";
import { containsUnsafeCheckoutReply, shouldSendCatalog } from "./message-routing";

describe("enrutamiento comercial", () => {
  it("manda saludos y peticiones explícitas al catálogo", () => {
    expect(shouldSendCatalog("Hola", 0)).toBe(true);
    expect(shouldSendCatalog("Catálogo", 4)).toBe(true);
    expect(shouldSendCatalog("Quiero que me envíes el catálogo", 2)).toBe(true);
  });

  it("deja que preguntas cortas lleguen al RAG", () => {
    expect(shouldSendCatalog("¿Cuánto cuesta?", 0)).toBe(false);
    expect(shouldSendCatalog("¿Hacen envíos?", 2)).toBe(false);
    expect(shouldSendCatalog("¿Venden colchones?", 0)).toBe(false);
    expect(shouldSendCatalog("Tienen almohadas", 0)).toBe(false);
    expect(shouldSendCatalog("¿Qué formas de pago aceptan?", 0)).toBe(false);
  });

  it("no desvía una solicitud de asesor al catálogo", () => {
    expect(shouldSendCatalog("Necesito hablar con un asesor", 0)).toBe(false);
    expect(shouldSendCatalog("Ya envié mi comprobante", 0)).toBe(false);
  });

  it("mantiene el bloqueo de acciones de checkout, no de respuestas seguras", () => {
    expect(containsUnsafeCheckoutReply("Comparte tu ubicación GPS para continuar.")).toBe(true);
    expect(containsUnsafeCheckoutReply("Indica tu ubicación para coordinar el pedido.")).toBe(true);
    expect(containsUnsafeCheckoutReply("Deposita el pago a esta cuenta.")).toBe(true);
    expect(containsUnsafeCheckoutReply("Pago aprobado.")).toBe(true);
    expect(containsUnsafeCheckoutReply("Tu comprobante queda en revisión por un asesor.")).toBe(false);
  });
});
