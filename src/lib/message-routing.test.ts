import { describe, expect, it } from "vitest";
import { containsUnsafeCheckoutReply, hasSensitiveCommerceData, isControlledCheckoutTopic, isKnowledgeQuestion, isPublicCompanyQuestion, requestsGeneralInformation, shouldSendCatalog } from "./message-routing";

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

  it("reconoce información pública de empresa como una consulta RAG", () => {
    const question = "¿Dónde están sus sucursales y cuáles son sus horarios?";
    expect(isPublicCompanyQuestion(question)).toBe(true);
    expect(isKnowledgeQuestion(question)).toBe(true);
    expect(hasSensitiveCommerceData(question)).toBe(false);
    expect(isControlledCheckoutTopic(question)).toBe(false);
  });

  it("protege la ubicación privada, pero no confunde una sucursal con GPS", () => {
    expect(hasSensitiveCommerceData("Mi dirección es cerca de la plaza")).toBe(true);
    expect(isControlledCheckoutTopic("Comparte tu ubicación GPS")).toBe(true);
    expect(isPublicCompanyQuestion("¿Cuál es la dirección de su oficina? ")).toBe(true);
    expect(hasSensitiveCommerceData("¿Cuál es la dirección de su oficina? ")).toBe(false);
  });

  it("no confunde una negación de producto con una petición de catálogo", () => {
    expect(shouldSendCatalog("No es sobre producto, es una consulta de la empresa", 2)).toBe(false);
  });

  it("detecta una intención de consulta sin desviarla al GPS o catálogo", () => {
    expect(requestsGeneralInformation("Ahora mismo quiero hacer una consulta")).toBe(true);
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
