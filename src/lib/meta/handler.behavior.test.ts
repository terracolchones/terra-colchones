import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral acceptance at the real handler boundary. All persistence, catalog,
 * generation and delivery are synthetic: these tests never access an account.
 * Transport, signature and atomic reservation regressions remain covered by the
 * existing safety suites; passing these tests is not evidence about Meta bans.
 */
const fixture = vi.hoisted(() => ({
  phone: "synthetic-behavior-customer",
  channel: "synthetic-behavior-channel",
  mode: "AI" as "AI" | "HUMAN",
  processed: new Set<string>(),
  messages: [] as Array<{ id: number; role: string; content: string; wa_message_id: string | null; created_at?: number }>,
  db: {
    claimCatalogOrder: vi.fn(),
    createCatalogCheckoutSession: vi.fn(),
    getCatalogLeadContext: vi.fn(),
    getConversationById: vi.fn(),
    getLatestActiveCatalogOrderForConversation: vi.fn(),
    getUnambiguousActiveCatalogOrderForConversation: vi.fn(),
    getLocationRequestedCatalogOrderForConversation: vi.fn(),
    getOrCreateConversation: vi.fn(),
    getRecentHistory: vi.fn(),
    insertMessage: vi.fn(),
    markMessageProcessed: vi.fn(),
    markCatalogOrderPaymentProof: vi.fn(),
    saveCatalogOrderLocation: vi.fn(),
    setCatalogLeadContext: vi.fn(),
    setMode: vi.fn(),
    updateMessageWaId: vi.fn(),
    wasMessageProcessed: vi.fn(),
  },
  meta: { sendTextMessage: vi.fn(), sendCatalogCtaMessage: vi.fn() },
  generateAssistantReply: vi.fn(),
  getProductForCatalogLead: vi.fn(),
  parseCatalogLeadContext: vi.fn(),
  dispatchCatalogLocationRequest: vi.fn(),
  dispatchCatalogPaymentQr: vi.fn(),
}));

vi.mock("@/lib/db", () => fixture.db);
vi.mock("@/lib/meta/client", () => fixture.meta);
vi.mock("@/lib/openai", () => ({ generateAssistantReply: fixture.generateAssistantReply }));
vi.mock("@/lib/catalog-storefront/server", () => ({ getProductForCatalogLead: fixture.getProductForCatalogLead }));
vi.mock("@/lib/catalog-storefront/whatsapp", () => ({ parseCatalogLeadContext: fixture.parseCatalogLeadContext }));
vi.mock("@/lib/catalog-order-flow", () => ({ dispatchCatalogLocationRequest: fixture.dispatchCatalogLocationRequest }));
vi.mock("@/lib/catalog-payment-flow", () => ({ dispatchCatalogPaymentQr: fixture.dispatchCatalogPaymentQr }));

import { processWebhookPayload } from "@/lib/meta/handler";
import { createAssistantResponder } from "@/lib/behavior/respond";
import { buildPublicDirectoryReply } from "@/lib/rag/public-contacts";

function conversation() {
  return { id: 1, phone: fixture.phone, name: "Synthetic customer", mode: fixture.mode, last_message_at: null, created_at: 0 };
}

function payload(content: string, id = "synthetic-behavior-event") {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: fixture.channel },
      messages: [{ id, from: fixture.phone, type: "text", text: { body: content } }],
    } }] }],
  };
}

function order(status = "awaiting_payment") {
  return {
    id: "synthetic-behavior-order", public_code: "T-TEST-DEMO", conversation_id: 1,
    product_id: "synthetic-product", product_slug: "synthetic-product", product_name: "Synthetic product",
    variant_id: "synthetic-variant", variant_label: "Synthetic variant", price: null, status,
    location_requested: 1, latitude: null, longitude: null, location_name: null, location_address: null,
    created_at: 0, updated_at: 0,
  };
}

function sentText() {
  return fixture.meta.sendTextMessage.mock.calls.map((call) => call[1] as string).join("\n");
}

function expectNoCheckoutAction() {
  expect(fixture.db.claimCatalogOrder).not.toHaveBeenCalled();
  expect(fixture.db.markCatalogOrderPaymentProof).not.toHaveBeenCalled();
  expect(fixture.db.saveCatalogOrderLocation).not.toHaveBeenCalled();
  expect(fixture.dispatchCatalogLocationRequest).not.toHaveBeenCalled();
  expect(fixture.dispatchCatalogPaymentQr).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  fixture.mode = "AI";
  fixture.processed.clear();
  fixture.messages.length = 0;
  vi.stubEnv("META_PHONE_NUMBER_ID", fixture.channel);
  vi.stubEnv("PUBLIC_APP_URL", "https://agent.invalid");
  vi.stubEnv("CATALOG_PUBLIC_URL", "https://catalog.invalid");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  fixture.db.getOrCreateConversation.mockImplementation(conversation);
  fixture.db.getConversationById.mockImplementation(conversation);
  fixture.db.getRecentHistory.mockImplementation((_id: number, limit: number) => fixture.messages.slice(-limit));
  fixture.db.insertMessage.mockImplementation((_id: number, role: string, content: string, wamid?: string) => {
    const id = fixture.messages.length + 1;
    fixture.messages.push({ id, role, content, wa_message_id: wamid ?? null, created_at: Math.floor(Date.now() / 1000) });
    return id;
  });
  fixture.db.wasMessageProcessed.mockImplementation((id: string) => fixture.processed.has(id));
  fixture.db.markMessageProcessed.mockImplementation((id: string) => {
    if (fixture.processed.has(id)) return false;
    fixture.processed.add(id);
    return true;
  });
  fixture.db.setMode.mockImplementation((_id: number, mode: "AI" | "HUMAN") => { fixture.mode = mode; });
  fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(null);
  fixture.db.getUnambiguousActiveCatalogOrderForConversation.mockReturnValue(undefined);
  fixture.db.getLocationRequestedCatalogOrderForConversation.mockReturnValue(null);
  fixture.db.getCatalogLeadContext.mockReturnValue(null);
  fixture.db.createCatalogCheckoutSession.mockReturnValue("synthetic-behavior-checkout");
  fixture.db.claimCatalogOrder.mockReturnValue({ result: "not_found", order: null });
  fixture.parseCatalogLeadContext.mockReturnValue(null);
  fixture.getProductForCatalogLead.mockResolvedValue(null);
  fixture.meta.sendTextMessage.mockResolvedValue({ wa_message_id: "synthetic-behavior-text" });
  fixture.meta.sendCatalogCtaMessage.mockResolvedValue({ wa_message_id: "synthetic-behavior-cta" });
  fixture.generateAssistantReply.mockResolvedValue({ content: "Respuesta aprobada de prueba.", needsAdvisorConfirmation: false });
  fixture.dispatchCatalogLocationRequest.mockResolvedValue("sent");
  fixture.dispatchCatalogPaymentQr.mockResolvedValue("sent");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("branch maps and conversational greetings at the real handler boundary", () => {
  const knowledge = [{ id: "published-synthetic-maps-0", title: "Sucursales", content: [
    "Sucursal 2 Sur - Ciudad Aurora", "Dirección: Avenida Sur Sintética.",
    "Ubicación: https://maps.example.invalid/sur", "",
    "Sucursal Central - Cochabamba", "Dirección: Calle de Prueba.",
    "Ubicación: https://maps.example.invalid/cocha",
  ].join("\n") }];
  function usePublishedDirectory() {
    const complete = vi.fn().mockRejectedValue(new Error("The directory must not call the model"));
    fixture.generateAssistantReply.mockImplementation(createAssistantResponder({
      getActiveBehavior: () => ({ id: 0, instructions: "Usa datos aprobados.", createdAt: "synthetic" }),
      retrieve: async (history) => {
        const directory = buildPublicDirectoryReply(history, knowledge);
        return { sources: directory?.sources ?? [], context: directory?.content ?? "", directoryReply: directory?.content };
      }, complete,
    }));
    return complete;
  }
  it.each([null, "awaiting_location", "awaiting_payment", "payment_proof_received"])(
    "keeps all screenshot variants factual and out of checkout with state %s", async (status) => {
      const activeOrder = status ? order(status) : null;
      const before = structuredClone(activeOrder);
      fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(activeOrder);
      const complete = usePublishedDirectory();
      const questions = ["Quiero dirección de Cochabamba", "Me puedes dar nuevamente de cocha", "Cocha",
        "Dame los datos de Cochabamba", "Dame todas tus direcciones", "Envíame ubicación sucursal Sur"];
      for (const [index, question] of questions.entries()) {
        const event = payload(question, `synthetic-map-${index}`);
        await processWebhookPayload(event);
        await processWebhookPayload(event);
        const reply = fixture.meta.sendTextMessage.mock.calls[index][1] as string;
        expect(reply.startsWith("¡Hola! 👋")).toBe(index === 0);
        if (index < 5) expect(reply).toContain("📍 Sucursal Central - Cochabamba\nhttps://maps.example.invalid/cocha");
        if (index >= 4) expect(reply).toContain("📍 Sucursal 2 Sur - Ciudad Aurora\nhttps://maps.example.invalid/sur");
        if (index === 5) expect(reply).not.toContain("Cochabamba");
        expect(reply).not.toMatch(/omitido|\*|asesor (?:puede revisar|debe confirmar)|comprobante|QR/);
      }
      expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(questions.length);
      expect(complete).not.toHaveBeenCalled();
      expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
      expect(fixture.db.setMode).not.toHaveBeenCalled();
      expect(activeOrder).toEqual(before);
      expectNoCheckoutAction();
    },
  );
  it("greets a resumed directory conversation once inside the same reply", async () => {
    usePublishedDirectory();
    fixture.messages.push({ id: 1, role: "assistant", content: "¿En qué te ayudo?", wa_message_id: "synthetic-old", created_at: Math.floor(Date.now() / 1000) - 1801 });
    await processWebhookPayload(payload("Quiero dirección de Cochabamba"));
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(sentText()).toMatch(/^¡Hola! 👋\n\nClaro 😊,/);
    expect(sentText()).toContain("https://maps.example.invalid/cocha");
    expectNoCheckoutAction();
  });
  it("greets a resumed catalog request and stops the CTA if an operator takes over during the greeting", async () => {
    fixture.messages.push({ id: 1, role: "assistant", content: "Catálogo enviado.", wa_message_id: "synthetic-old", created_at: Math.floor(Date.now() / 1000) - 1801 });
    fixture.meta.sendTextMessage.mockImplementationOnce(async () => {
      fixture.mode = "HUMAN";
      return { wa_message_id: "synthetic-greeting" };
    });
    await processWebhookPayload(payload("catálogo"));
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(fixture.phone, "¡Hola! 👋 Te comparto el catálogo de Terra.");
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
    expectNoCheckoutAction();
  });
});

describe("explicit advisor access without false handoffs", () => {
  it("preserves literal asesor and acknowledges it once even with replay and another request", async () => {
    const event = payload("asesor");
    await processWebhookPayload(event);
    await processWebhookPayload(event);
    await processWebhookPayload(payload("asesor", "synthetic-second-advisor"));

    expect(fixture.db.setMode).toHaveBeenCalledExactlyOnceWith(1, "HUMAN");
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(
      fixture.phone, "¡Hola! 👋\n\nPerfecto, te conecto con un asesor comercial para ayudarte a avanzar.",
    );
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
    expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
    expectNoCheckoutAction();
  });

  it.each([
    "No quiero un asesor", "No necesito hablar con un asesor", "¿Eres humano?",
    "No estoy pidiendo hablar con asesor", "Quiero información sobre el asesor",
    "Si necesito un asesor les aviso", "No sé si necesito un asesor",
    "El asesor me dijo que puedo hablar con un representante",
  ])(
    "does not transfer merely because the customer mentions an advisor: %s", async (content) => {
      await processWebhookPayload(payload(content));
      expect(fixture.mode).toBe("AI");
      expect(fixture.db.setMode).not.toHaveBeenCalled();
      expect(sentText()).not.toContain("te conecto con un asesor");
      expectNoCheckoutAction();
    },
  );

  it.each([
    "Quiero saber si puedo hablar con un asesor", "¿Puedo hablar con una persona?",
    "Necesito que me atienda alguien de la tienda", "Quiero que un asesor me ayude",
  ])("transfers explicit polite requests once without consulting the model: %s", async (content) => {
    await processWebhookPayload(payload(content));
    await processWebhookPayload(payload(content));
    expect(fixture.db.setMode).toHaveBeenCalledExactlyOnceWith(1, "HUMAN");
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
    expectNoCheckoutAction();
  });

  it("retains the exact advisor instruction for a first website order confirmation", async () => {
    fixture.db.claimCatalogOrder.mockReturnValueOnce({ result: "claimed", order: order("awaiting_location") });
    await processWebhookPayload(payload("Hola Terra, confirmo mi pedido #T-TEST-DEMO"));
    expect(sentText()).toContain('Si quieres hablar con un asesor, escribe "asesor".');
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(fixture.dispatchCatalogLocationRequest).toHaveBeenCalledExactlyOnceWith("synthetic-behavior-order");
  });

  it("an explicit advisor request takes priority even when a product link is included", async () => {
    fixture.parseCatalogLeadContext.mockReturnValueOnce({ productId: "synthetic-product", variantId: null });
    await processWebhookPayload(payload("Quiero hablar con un asesor sobre el producto seleccionado"));

    expect(fixture.db.setMode).toHaveBeenCalledExactlyOnceWith(1, "HUMAN");
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(fixture.getProductForCatalogLead).not.toHaveBeenCalled();
    expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
    expectNoCheckoutAction();
  });
});

describe("a confirmed order supplies context without forcing every message into checkout", () => {
  it.each(["¿Ya aprobaron mi pago?", "Quiero saber el estado de mi comprobante", "¿Mi comprobante sigue en revisión?"])(
    "answers the known review status without consulting commercial knowledge: %s", async (content) => {
      const activeOrder = order("payment_proof_received");
      const before = structuredClone(activeOrder);
      fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(activeOrder);
      const event = payload(content);
      await processWebhookPayload(event);
      await processWebhookPayload(event);
      expect(sentText()).toContain("está en revisión por el equipo");
      expect(sentText()).toContain("Todavía no tengo una confirmación de aprobación");
      expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
      expect(fixture.db.setMode).not.toHaveBeenCalled();
      expect(activeOrder).toEqual(before);
      expectNoCheckoutAction();
    },
  );
  it("does not invent a proof or approval when a payment status is requested", async () => {
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(order("awaiting_payment"));
    await processWebhookPayload(payload("¿Ya aprobaron mi pago?"));
    expect(sentText()).toContain("no tengo un comprobante registrado");
    expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
    expect(fixture.db.setMode).not.toHaveBeenCalled();
    expectNoCheckoutAction();
  });
  it.each([null, "awaiting_location", "awaiting_payment", "payment_proof_received"])(
    "answers a short affirmation using the previous question with status %s", async (status) => {
      fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(status ? order(status) : null);
      fixture.messages.push({ id: 1, role: "assistant", content: "¿Lo prefieres firme?", wa_message_id: "synthetic-previous-question" });
      await processWebhookPayload(payload("Sí"));
      expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
      expect(fixture.generateAssistantReply.mock.calls[0][0]).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: "assistant", content: "¿Lo prefieres firme?" }),
        expect.objectContaining({ role: "user", content: "Sí" }),
      ]));
      expect(sentText()).not.toContain("¡Con gusto!");
      expectNoCheckoutAction();
    },
  );
  it.each([
    ["awaiting_payment", "¿Qué garantía tiene?"],
    ["awaiting_payment", "¿Puedo pagar al recibir?"],
    ["payment_proof_received", "¿Qué formas de pago aceptan?"],
    ["awaiting_location", "¿Cuánto demora la entrega?"],
  ])("answers %s questions using the available source: %s", async (status, question) => {
    const activeOrder = order(status);
    const before = structuredClone(activeOrder);
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(activeOrder);
    await processWebhookPayload(payload(question));

    expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
    // Equality ensures no unconditional GPS/payment reminder is appended after generation.
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(fixture.phone, "¡Hola! 👋\n\nRespuesta aprobada de prueba.");
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
    expect(fixture.db.setMode).not.toHaveBeenCalled();
    expect(activeOrder).toEqual(before);
    expectNoCheckoutAction();
  });

  it("a thank-you after proof submission does not repeat the payment status or instructions", async () => {
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(order("payment_proof_received"));
    fixture.generateAssistantReply.mockResolvedValueOnce({ content: "¡Con gusto!", needsAdvisorConfirmation: false });
    await processWebhookPayload(payload("Gracias"));

    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(sentText()).not.toMatch(/comprobante|pago|revisi[oó]n|ubicaci[oó]n|QR/i);
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
    expectNoCheckoutAction();
  });

  it("a price objection during payment reaches conversation instead of requesting proof", async () => {
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(order());
    fixture.generateAssistantReply.mockResolvedValueOnce({
      content: "Entiendo. ¿Qué presupuesto tienes pensado?", needsAdvisorConfirmation: false,
    });
    await processWebhookPayload(payload("Está caro"));

    expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(fixture.phone, "¡Hola! 👋\n\nEntiendo. ¿Qué presupuesto tienes pensado?");
    expectNoCheckoutAction();
  });

  it("a thank-you does not use an unresolved QR reservation as permission for another attempt", async () => {
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue({
      ...order("awaiting_location"), latitude: 0, longitude: 0,
    });
    fixture.dispatchCatalogPaymentQr.mockResolvedValueOnce("in_progress");
    await processWebhookPayload(payload("Gracias"));

    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expectNoCheckoutAction();
  });

  it("a missing invoice query cannot dispatch a pending payment QR", async () => {
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue({
      ...order("awaiting_location"), latitude: 0, longitude: 0,
    });
    await processWebhookPayload(payload("No me llegó la factura"));

    expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(fixture.phone, "¡Hola! 👋\n\nRespuesta aprobada de prueba.");
    expectNoCheckoutAction();
  });

  it.each([
    "Mi correo de prueba es cliente@example.invalid",
    "Mira este enlace https://example.invalid/producto-ficticio",
    "Mi dirección es una dirección ficticia para esta prueba",
  ])("private data is never permission to dispatch a pending QR: %s", async (content) => {
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue({
      ...order("awaiting_location"), latitude: 0, longitude: 0,
    });
    await processWebhookPayload(payload(content));

    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
    expect(fixture.db.setMode).not.toHaveBeenCalled();
    expectNoCheckoutAction();
  });

  it("an assertion of payment with stored GPS does not authorize QR dispatch or approve payment", async () => {
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue({
      ...order("awaiting_location"), latitude: 0, longitude: 0,
    });
    await processWebhookPayload(payload("Ya pagué"));

    expect(sentText()).not.toMatch(/pago (?:aprobado|confirmado|validado)/i);
    expectNoCheckoutAction();
  });

  it("an explicit QR request reaches the guarded dispatcher once and preserves uncertainty", async () => {
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue({
      ...order("awaiting_location"), latitude: 0, longitude: 0,
    });
    fixture.dispatchCatalogPaymentQr.mockResolvedValueOnce("in_progress");
    const event = payload("QR");
    await processWebhookPayload(event);
    await processWebhookPayload(event);

    expect(fixture.dispatchCatalogPaymentQr).toHaveBeenCalledExactlyOnceWith("synthetic-behavior-order");
    expect(fixture.dispatchCatalogLocationRequest).not.toHaveBeenCalled();
    expect(fixture.db.claimCatalogOrder).not.toHaveBeenCalled();
    expect(fixture.db.markCatalogOrderPaymentProof).not.toHaveBeenCalled();
    expect(fixture.db.saveCatalogOrderLocation).not.toHaveBeenCalled();
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(sentText()).toMatch(/pendiente|confirmaci[oó]n/i);
    expect(sentText()).not.toMatch(/lo reintentaremos|volveremos a enviar/i);
  });

  it.each(["Quiero cancelar mi pedido", "Quiero cancelar el pedido #T-TEST-DEMO"])(
    "acknowledges a cancellation request without claiming, cancelling or demanding payment: %s", async (content) => {
      const activeOrder = order();
      const before = structuredClone(activeOrder);
      fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(activeOrder);
      await processWebhookPayload(payload(content));

      expect(sentText()).toMatch(/cancel|asesor|equipo/i);
      expect(sentText()).not.toMatch(/env[ií]a (?:la imagen de )?tu comprobante|pedido (?:ya )?(?:est[aá]|ha sido|fue) cancelado|cancelaci[oó]n confirmada/i);
      expect(fixture.db.setMode).not.toHaveBeenCalled();
      expect(activeOrder).toEqual(before);
      expectNoCheckoutAction();
    },
  );

  it.each(["nuevo pedido", "catálogo"])("allows %s without clearing an existing order", async (content) => {
    const activeOrder = order("payment_proof_received");
    const before = structuredClone(activeOrder);
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(activeOrder);
    await processWebhookPayload(payload(content));

    expect(fixture.meta.sendCatalogCtaMessage).toHaveBeenCalledExactlyOnceWith(
      fixture.phone, "https://catalog.invalid/?checkout=synthetic-behavior-checkout",
    );
    expect(sentText()).not.toMatch(/comprobante|pago|revisi[oó]n/i);
    expect(activeOrder).toEqual(before);
    expectNoCheckoutAction();
  });

  it.each([null, "awaiting_payment"])("a public business address query is answerable with order state %s", async (status) => {
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(status ? order(status) : null);
    await processWebhookPayload(payload("¿Cuál es su dirección?"));

    expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(fixture.phone, "¡Hola! 👋\n\nRespuesta aprobada de prueba.");
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
    expectNoCheckoutAction();
  });

  it.each([
    [null, "Dame los número de Cochabamba"],
    ["awaiting_location", "Dame los número de Cochabamba"],
    ["awaiting_payment", "Dame los números de Cochabamna"],
    ["payment_proof_received", "Número de contacto?"],
    ["awaiting_payment", "¿Y su número?"],
    [null, "Pásame el contacto del asesor de la tienda"],
  ])("keeps a contact query conversational with order state %s: %s", async (status, content) => {
    const activeOrder = status ? order(status) : null;
    const before = structuredClone(activeOrder);
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(activeOrder);
    const event = payload(content as string);
    await processWebhookPayload(event);
    await processWebhookPayload(event);

    expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(fixture.phone, "¡Hola! 👋\n\nRespuesta aprobada de prueba.");
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
    expect(fixture.db.setMode).not.toHaveBeenCalled();
    expect(activeOrder).toEqual(before);
    expectNoCheckoutAction();
  });

  it.each(["¿Cuál es el número de mi pedido?", "Mi dirección es privada; dame el contacto de la oficina"])(
    "preserves private-data protection during a purchase: %s", async (content) => {
      fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(order());
      await processWebhookPayload(payload(content));
      expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
      expect(sentText()).toContain("Un asesor puede revisar ese dato de tu pedido.");
      expect(fixture.db.setMode).not.toHaveBeenCalled();
      expectNoCheckoutAction();
    },
  );

  it.each(["Ciudad Ejemplo", "¿Y Asesor Ejemplo?"])(
    "passes contact clarifications and their history through without resuming checkout: %s", async (content) => {
      fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(order("awaiting_payment"));
      fixture.messages.push(
        { id: 1, role: "user", content: "Dame los teléfonos de la tienda", wa_message_id: "synthetic-contact-question" },
        { id: 2, role: "assistant", content: "¿De qué ciudad necesitas los contactos?", wa_message_id: "synthetic-contact-clarification" },
      );
      await processWebhookPayload(payload(content));
      expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
      expect(fixture.generateAssistantReply.mock.calls[0][0]).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Dame los teléfonos de la tienda" }),
        expect.objectContaining({ role: "user", content }),
      ]));
      expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(fixture.db.setMode).not.toHaveBeenCalled();
      expectNoCheckoutAction();
    },
  );
});

describe("intent edge cases preserve consent and access to knowledge", () => {
  it.each([null, "awaiting_location", "awaiting_payment"])(
    "responds to purchase hesitation conversationally without a catalog or checkout with status %s", async (status) => {
      fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(status ? order(status) : null);
      const content = "Lo voy a pensar, todavía no estoy listo para comprar.";
      fixture.generateAssistantReply.mockResolvedValueOnce({
        content: "Claro, tómate tu tiempo. Aquí estoy si te surge alguna duda.", needsAdvisorConfirmation: false,
      });
      await processWebhookPayload(payload(content));
      expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
      expect(fixture.generateAssistantReply.mock.calls[0][0]).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: "user", content }),
      ]));
      expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(
        fixture.phone, "¡Hola! 👋\n\nClaro, tómate tu tiempo. Aquí estoy si te surge alguna duda.",
      );
      expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
      expectNoCheckoutAction();
    },
  );

  it.each(["No confirmo mi pedido #T-TEST-DEMO", "Todavía no confirmo mi pedido #T-TEST-DEMO"])(
    "does not claim a code or request GPS after a negated confirmation: %s", async (content) => {
      fixture.db.claimCatalogOrder.mockReturnValue({ result: "claimed", order: order("awaiting_location") });
      await processWebhookPayload(payload(content));
      expectNoCheckoutAction();
      expect(sentText()).not.toMatch(/pedido .*confirmado|ahora comparte tu ubicaci[oó]n/i);
    },
  );

  it("honors an advisor request after a complaint containing a separate negation", async () => {
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(order());
    await processWebhookPayload(payload("No recibí el QR, quiero hablar con un asesor"));
    expect(fixture.db.setMode).toHaveBeenCalledExactlyOnceWith(1, "HUMAN");
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(
      fixture.phone, "¡Hola! 👋\n\nPerfecto, te conecto con un asesor comercial para ayudarte a avanzar.",
    );
    expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
    expectNoCheckoutAction();
  });

  it("answers a specific first-message budget need without forcing the catalog", async () => {
    fixture.generateAssistantReply.mockResolvedValueOnce({
      content: "Claro. ¿Qué presupuesto tienes pensado?", needsAdvisorConfirmation: false,
    });
    await processWebhookPayload(payload("Necesito algo más económico"));
    expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(fixture.phone, "¡Hola! 👋\n\nClaro. ¿Qué presupuesto tienes pensado?");
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
    expectNoCheckoutAction();
  });

  it("a card-method question during payment reaches the real RAG policy with approved evidence", async () => {
    const approved = "Aceptamos pagos con tarjeta de débito según la política comercial publicada.";
    const retrieve = vi.fn().mockResolvedValue({ context: approved, sources: [{
      id: "synthetic-card-policy", kind: "knowledge", label: "Formas de pago", content: approved, score: 1,
    }] });
    const complete = vi.fn().mockResolvedValue("Sí, aceptamos tarjeta de débito.");
    const respond = createAssistantResponder({
      getActiveBehavior: () => ({ id: 1, instructions: "Responde la pregunta con información aprobada.", createdAt: "synthetic" }),
      retrieve, complete,
    });
    fixture.generateAssistantReply.mockImplementation(respond);
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(order());
    await processWebhookPayload(payload("¿Aceptan tarjeta?"));
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].instructions).toContain(approved);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(fixture.phone, "¡Hola! 👋\n\nSí, aceptamos tarjeta de débito.");
    expect(fixture.db.setMode).not.toHaveBeenCalled();
    expectNoCheckoutAction();
  });
});
