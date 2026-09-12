import { describe, expect, it } from "vitest";
import {
  hasSensitiveCommerceData,
  isControlledCheckoutTopic,
  isKnowledgeQuestion,
  isPublicCompanyQuestion,
  requestsHumanSupport,
} from "./message-routing";

describe("customer intent without keyword-only handoffs", () => {
  it.each([
    "asesor", "Quiero hablar con un asesor", "Necesito atención humana", "Pásame con una persona real",
    "No entiendo, quiero hablar con un asesor", "No puedo pagar, pásame con un asesor",
  ])(
    "recognizes the explicit handoff request: %s", (message) => {
      expect(requestsHumanSupport(message)).toBe(true);
    },
  );

  it.each(["No quiero un asesor", "No necesito hablar con un asesor", "¿Eres humano?", "¿Qué es un asesor?"])(
    "does not equate a mention, denial or identity question with consent to transfer: %s", (message) => {
      expect(requestsHumanSupport(message)).toBe(false);
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
