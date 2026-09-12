import { describe, expect, it } from "vitest";
import {
  hasSensitiveCommerceData,
  isAcknowledgment,
  isControlledCheckoutTopic,
  isKnowledgeQuestion,
  isPublicContactQuestion,
  isPublicDirectoryQuestion,
  isPublicCompanyQuestion,
  requestsHumanSupport,
  requestsCheckoutAction,
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

  it.each([
    "Dame los número de Cochabamba",
    "Dame los números de Cochabamna",
    "Teléfonos de Santa Cruz",
    "Número de contacto?",
    "¿Y su número?",
    "¿Cuál es tu número de contacto?",
    "Dame tus números de teléfono",
    "Y los celulares de Tarija",
    "Pásame el contacto del asesor de la tienda",
    "Quiero los datos de Cochabamba tanto oficina y números",
    "Dame el teléfono de Asesor Ejemplo",
    "WhatsApp de la sucursal",
  ])("routes a commercial contact request to knowledge without assuming a handoff: %s", (message) => {
    expect(isPublicContactQuestion(message)).toBe(true);
    expect(isPublicCompanyQuestion(message)).toBe(true);
    expect(isKnowledgeQuestion(message)).toBe(true);
    expect(hasSensitiveCommerceData(message)).toBe(false);
    expect(isControlledCheckoutTopic(message)).toBe(false);
    expect(requestsHumanSupport(message)).toBe(false);
    expect(shouldSendCatalog(message, 0)).toBe(false);
  });

  it.each([
    "Mi número es privado",
    "Mi nuevo celular es privado",
    "¿Cuál es el número de mi pedido?",
    "Dame el número de cuenta bancaria",
    "Dame el teléfono de la cuenta bancaria",
    "Número de tarjeta",
    "El código de mi comprobante",
    "Mi dirección es privada; dame el contacto de la oficina",
    "Mi tarjeta es privada, ¿cuáles son sus horarios?",
    "¿Su número de contacto es 00000000?",
    "Dame el contacto. Mi correo es cliente@example.invalid",
    "El teléfono de la oficina está en https://example.invalid/contacto",
  ])("does not exempt private or concrete data because a message also mentions the company: %s", (message) => {
    expect(isPublicContactQuestion(message)).toBe(false);
    expect(hasSensitiveCommerceData(message)).toBe(true);
    expect(shouldSendCatalog(message, 0)).toBe(false);
  });

  it.each([
    "Quiero dirección de Cochabamba",
    "Dame todas tus direcciones",
    "Dame los datos de Cochabamba",
    "¿Dónde están?",
    "Dónde se encuentran sus sucursales",
    "¿Cómo llego a la sucursal Norte?",
    "Envíame ubicación de la sucursal Sur",
    "Enviame ubicación sucursal Sur",
    "Mándame el GPS de la tienda",
    "GPS sucursal Sur",
    "Ubicación de la sucursal Central",
    "Dirección de Ciudad Ejemplo",
    "Pásame los mapas de sus tiendas",
    "Dame tus ubicaciones",
    "Quisiera conocer la dirección",
    "Direcciones",
  ])("routes public branch locations to knowledge instead of a private checkout step: %s", (message) => {
    expect(isPublicDirectoryQuestion(message)).toBe(true);
    expect(isPublicCompanyQuestion(message)).toBe(true);
    expect(isKnowledgeQuestion(message)).toBe(true);
    expect(hasSensitiveCommerceData(message)).toBe(false);
    expect(requestsCheckoutAction(message)).toBe(false);
    expect(isControlledCheckoutTopic(message)).toBe(false);
    expect(requestsHumanSupport(message)).toBe(false);
    expect(shouldSendCatalog(message, 0)).toBe(false);
    expect(shouldSendCatalog(message, 8)).toBe(false);
  });

  it.each([
    "Mi ubicación es privada; quiero la dirección de la sucursal",
    "Mis direcciones son privadas, dame los datos de la tienda",
    "Vivo en un barrio privado, dame la ubicación de la sucursal",
    "¿Cuál es la ubicación de mi pedido?",
    "Dame los datos de mi cuenta bancaria",
    "Dame las direcciones de los clientes",
    "Dame los datos de mi pedido",
    "Quiero dirección para mi pedido",
    "Dame dirección de entrega",
    "Enviame ubicación sucursal Sur, estoy en 0.0000, 1.0000",
    "Quiero dirección de Cochabamba https://example.invalid/ubicacion",
  ])("does not disclose supplied private locations or account/order data through a branch query: %s", (message) => {
    expect(isPublicDirectoryQuestion(message)).toBe(false);
    expect(isPublicCompanyQuestion(message)).toBe(false);
    expect(hasSensitiveCommerceData(message)).toBe(true);
  });

  it.each(["Ubicación", "GPS", "Envíame ubicación", "Reenvía el GPS", "QR", "No recibí el QR", "Envíame QR y la ubicación de la tienda"])(
    "keeps an actual checkout request distinct from public branch locations: %s", (message) => {
      expect(isPublicDirectoryQuestion(message)).toBe(false);
      expect(requestsCheckoutAction(message)).toBe(true);
      expect(isControlledCheckoutTopic(message)).toBe(true);
    },
  );
});
