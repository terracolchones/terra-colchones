import { describe, expect, it } from "vitest";
import {
  hasSensitiveCommerceData,
  isAcknowledgment,
  isControlledCheckoutTopic,
  isKnowledgeQuestion,
  isPublicCompanyQuestion,
  requestsHumanSupport,
  shouldSendCatalog,
} from "./message-routing";

describe("customer intent without keyword-only handoffs", () => {
  it.each([
    "asesor", "Quiero hablar con un asesor", "Necesito atención humana", "Pásame con una persona real",
    "No entiendo, quiero hablar con un asesor", "No puedo pagar, pásame con un asesor",
    "Quiero saber si puedo hablar con un asesor", "¿Puedo hablar con una persona?",
    "Me gustaría hablar con un asesor", "Necesito que me atienda alguien de la tienda",
    "Quiero que un asesor me ayude", "Si es posible, pásame con un asesor",
  ])(
    "recognizes the explicit handoff request: %s", (message) => {
      expect(requestsHumanSupport(message)).toBe(true);
    },
  );

  it.each([
    "No quiero un asesor", "No necesito hablar con un asesor", "¿Eres humano?", "¿Qué es un asesor?",
    "No estoy pidiendo hablar con asesor", "Quiero información sobre el asesor",
    "Si necesito un asesor les aviso", "No sé si necesito un asesor",
    "El asesor me dijo que puedo hablar con un representante", "Cuando necesite un asesor les aviso",
  ])(
    "does not equate a mention, denial or identity question with consent to transfer: %s", (message) => {
      expect(requestsHumanSupport(message)).toBe(false);
    },
  );

  it.each(["Sí", "Perfecto", "Listo", "Dale", "De acuerdo", "Ok", "No, gracias"])(
    "preserves context-dependent answers for the conversation: %s", (message) => {
      expect(isAcknowledgment(message)).toBe(false);
    },
  );

  it.each([
    "Lo voy a pensar, todavía no estoy listo para comprar.",
    "Todavía no estoy segura de hacer la compra.",
    "No puedo comprar ahora.",
    "Prefiero esperar antes de hacer el pedido.",
    "Solo estoy comparando productos.",
  ])("does not turn hesitation into a catalog request: %s", (message) => {
    expect(shouldSendCatalog(message, 0)).toBe(false);
    expect(shouldSendCatalog(message, 8)).toBe(false);
  });

  it.each(["Quiero comprar", "Quiero ver el catálogo", "Ver catálogo"])(
    "preserves the requested shopping entry: %s", (message) => {
      expect(shouldSendCatalog(message, 0)).toBe(true);
    },
  );

  it.each(["¿Puedo pagar al recibir?", "¿Qué formas de pago aceptan?", "¿Qué garantía tiene?"])(
    "recognizes a commercial policy question without executing a payment step: %s", (message) => {
      expect(isKnowledgeQuestion(message)).toBe(true);
      expect(isControlledCheckoutTopic(message)).toBe(false);
      expect(hasSensitiveCommerceData(message)).toBe(false);
    },
  );

  it("separates the shop address from a customer's private delivery address", () => {
    expect(isPublicCompanyQuestion("¿Cuál es su dirección?")).toBe(true);
    expect(hasSensitiveCommerceData("¿Cuál es su dirección?")).toBe(false);
    expect(isControlledCheckoutTopic("¿Cuál es su dirección?")).toBe(false);
    expect(hasSensitiveCommerceData("Mi dirección es una dirección ficticia para entrega")).toBe(true);
  });
});
