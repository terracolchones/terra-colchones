import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Offline characterization of the production handler, not a WhatsApp test.
 * Every persistence / provider boundary is replaced before importing it.
 * All aliases, messages, media and coordinates below are invented fixtures.
 * These mocks do NOT demonstrate SQLite concurrency or Meta's ban decisions.
 *
 * "KNOWN DEFECT OBSERVED" cases characterize the exact defective behavior of
 * this baseline. Their passing status is NOT approval of those defects and is
 * NOT a regression guarantee for the desired safe behavior. They assert both
 * the preconditions and the observed effect, so an unrelated exception cannot
 * masquerade as a reproduced defect. After correcting each defect, replace its
 * expectations with the intended safe behavior.
 */
const fixture = vi.hoisted(() => ({
  phone: "synthetic-customer-alpha",
  channel: "synthetic-channel-allowed",
  mode: "AI" as "AI" | "HUMAN",
  processed: new Set<string>(),
  messages: [] as Array<{ id: number; role: string; content: string; wa_message_id: string | null }>,
  db: {
    claimCatalogOrder: vi.fn(),
    createCatalogCheckoutSession: vi.fn(),
    getCatalogLeadContext: vi.fn(),
    getConversationById: vi.fn(),
    getLatestActiveCatalogOrderForConversation: vi.fn(),
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

function conversation() {
  return { id: 1, phone: fixture.phone, name: "Synthetic customer", mode: fixture.mode, last_message_at: null, created_at: 0 };
}

function textMessage(id = "synthetic-wamid-alpha", body = "Hola") {
  return { id, from: fixture.phone, type: "text", text: { body } };
}

function payload(message: Record<string, unknown>, channel = fixture.channel) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "synthetic-waba-alpha", changes: [{
      field: "messages",
      value: { metadata: { phone_number_id: channel }, messages: [message] },
    }] }],
  };
}

function order(status = "awaiting_payment") {
  return {
    id: "synthetic-order-alpha", public_code: "T-TEST-DEMO", conversation_id: 1,
    product_id: "synthetic-product", product_slug: "synthetic-product", product_name: "Synthetic product",
    variant_id: null, variant_label: null, price: null, status, location_requested: 1,
    latitude: null, longitude: null, location_name: null, location_address: null,
    created_at: 0, updated_at: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function expectNoDelivery() {
  expect(fixture.meta.sendTextMessage).not.toHaveBeenCalled();
  expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
  expect(fixture.dispatchCatalogLocationRequest).not.toHaveBeenCalled();
  expect(fixture.dispatchCatalogPaymentQr).not.toHaveBeenCalled();
  expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  fixture.mode = "AI";
  fixture.processed.clear();
  fixture.messages.length = 0;
  vi.stubEnv("META_PHONE_NUMBER_ID", fixture.channel);
  vi.stubEnv("PUBLIC_APP_URL", "https://agent.invalid");
  vi.stubEnv("CATALOG_PUBLIC_URL", "https://catalog.invalid");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  fixture.db.getOrCreateConversation.mockImplementation(conversation);
  fixture.db.getConversationById.mockImplementation(conversation);
  fixture.db.getRecentHistory.mockImplementation((_id: number, limit: number) => fixture.messages.slice(-limit));
  fixture.db.insertMessage.mockImplementation((_id: number, role: string, content: string, wamid?: string) => {
    const id = fixture.messages.length + 1;
    fixture.messages.push({ id, role, content, wa_message_id: wamid ?? null });
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
  fixture.db.getLocationRequestedCatalogOrderForConversation.mockReturnValue(null);
  fixture.db.getCatalogLeadContext.mockReturnValue(null);
  fixture.db.createCatalogCheckoutSession.mockReturnValue("synthetic-checkout-token");
  fixture.db.claimCatalogOrder.mockReturnValue({ result: "not_found", order: null });
  fixture.db.saveCatalogOrderLocation.mockReturnValue({ saved: true });
  fixture.parseCatalogLeadContext.mockReturnValue(null);
  fixture.getProductForCatalogLead.mockResolvedValue(null);
  fixture.meta.sendTextMessage.mockResolvedValue({ wa_message_id: "synthetic-accepted-text" });
  fixture.meta.sendCatalogCtaMessage.mockResolvedValue({ wa_message_id: "synthetic-accepted-cta" });
  fixture.generateAssistantReply.mockResolvedValue({ content: "Respuesta pública simulada.", needsAdvisorConfirmation: false });
  fixture.dispatchCatalogLocationRequest.mockResolvedValue("sent");
  fixture.dispatchCatalogPaymentQr.mockResolvedValue("sent");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("offline handler characterization (no real database or provider)", () => {
  it("first Hola waits for the greeting send before sending exactly one catalog CTA", async () => {
    const greeting = deferred<{ wa_message_id: string }>();
    const sequence: string[] = [];
    fixture.meta.sendTextMessage.mockImplementationOnce(async () => {
      sequence.push("text-started");
      const accepted = await greeting.promise;
      sequence.push("text-accepted");
      return accepted;
    });
    fixture.meta.sendCatalogCtaMessage.mockImplementationOnce(async () => {
      sequence.push("cta-started");
      return { wa_message_id: "synthetic-accepted-cta" };
    });

    const processing = processWebhookPayload(payload(textMessage()));
    expect(sequence).toEqual(["text-started"]);
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
    greeting.resolve({ wa_message_id: "synthetic-accepted-text" });
    await processing;

    expect(sequence).toEqual(["text-started", "text-accepted", "cta-started"]);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendCatalogCtaMessage).toHaveBeenCalledExactlyOnceWith(
      fixture.phone, "https://catalog.invalid/?checkout=synthetic-checkout-token",
    );
    expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
  });

  it("a replay of the same WAMID while the first send is pending does not start another response", async () => {
    const greeting = deferred<{ wa_message_id: string }>();
    fixture.meta.sendTextMessage.mockReturnValueOnce(greeting.promise);
    const event = payload(textMessage());
    const first = processWebhookPayload(event);
    await processWebhookPayload(event);
    expect(fixture.db.markMessageProcessed).toHaveBeenCalledTimes(1);
    expect(fixture.db.getOrCreateConversation).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    greeting.resolve({ wa_message_id: "synthetic-accepted-text" });
    await first;
    expect(fixture.meta.sendCatalogCtaMessage).toHaveBeenCalledTimes(1);
  });

  it("BASELINE OBSERVED: two distinct Hola WAMIDs in one chat produce one greeting and two CTAs, with interleaved processing", async () => {
    const greeting = deferred<{ wa_message_id: string }>();
    const sequence: string[] = [];
    fixture.meta.sendTextMessage.mockImplementationOnce(async () => {
      sequence.push("greeting-pending");
      const accepted = await greeting.promise;
      sequence.push("greeting-accepted");
      return accepted;
    });
    fixture.meta.sendCatalogCtaMessage.mockImplementation(async () => {
      sequence.push("cta-sent");
      return { wa_message_id: "synthetic-accepted-cta" };
    });

    const first = processWebhookPayload(payload(textMessage("synthetic-first-hola")));
    expect(sequence).toEqual(["greeting-pending"]);
    await processWebhookPayload(payload(textMessage("synthetic-second-hola")));
    expect(sequence).toEqual(["greeting-pending", "cta-sent"]);
    greeting.resolve({ wa_message_id: "synthetic-accepted-text" });
    await first;

    expect(sequence).toEqual(["greeting-pending", "cta-sent", "greeting-accepted", "cta-sent"]);
    expect(fixture.db.markMessageProcessed.mock.calls).toEqual([
      ["synthetic-first-hola"], ["synthetic-second-hola"],
    ]);
    expect(fixture.messages.filter((message) => message.role === "user")).toHaveLength(2);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendCatalogCtaMessage).toHaveBeenCalledTimes(2);
    expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
    // This observes local ordering only; it does not establish a cause of a Meta ban.
  });

  it("a denied atomic reservation stops processing even when the earlier lookup did not find the WAMID", async () => {
    fixture.db.wasMessageProcessed.mockReturnValue(false);
    fixture.db.markMessageProcessed.mockReturnValue(false);
    await processWebhookPayload(payload(textMessage()));
    expect(fixture.db.getOrCreateConversation).not.toHaveBeenCalled();
    expect(fixture.db.insertMessage).not.toHaveBeenCalled();
    expectNoDelivery();
  });

  it("delivery-status-only events never create conversations or replies", async () => {
    await processWebhookPayload({ object: "whatsapp_business_account", entry: [{ changes: [{
      field: "messages", value: { metadata: { phone_number_id: fixture.channel }, statuses: [
        { id: "synthetic-status-sent", status: "sent" },
        { id: "synthetic-status-delivered", status: "delivered" },
        { id: "synthetic-status-read", status: "read" },
        { id: "synthetic-status-failed", status: "failed", errors: [{ code: "synthetic-error" }] },
      ] },
    }] }] });
    expect(fixture.db.markMessageProcessed).not.toHaveBeenCalled();
    expect(fixture.db.getOrCreateConversation).not.toHaveBeenCalled();
    expectNoDelivery();
  });

  it("text received after HUMAN mode is set is stored but does not trigger automation", async () => {
    fixture.mode = "HUMAN";
    await processWebhookPayload(payload(textMessage()));
    expect(fixture.db.insertMessage).toHaveBeenCalledExactlyOnceWith(1, "user", "Hola", "synthetic-wamid-alpha");
    expectNoDelivery();
  });

  it("an explicit human-support request sets HUMAN before sending its single acknowledgment", async () => {
    fixture.meta.sendTextMessage.mockImplementationOnce(async () => {
      expect(fixture.mode).toBe("HUMAN");
      return { wa_message_id: "synthetic-human-ack" };
    });
    await processWebhookPayload(payload(textMessage("synthetic-human-request", "Quiero hablar con un asesor")));
    expect(fixture.db.setMode).toHaveBeenCalledExactlyOnceWith(1, "HUMAN");
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
    expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
  });
});

describe("known defects observed on the baseline — characterization, not approval or fixes", () => {
  it("KNOWN DEFECT OBSERVED: a message addressed to another channel is reserved, stored and answered", async () => {
    const otherChannel = "synthetic-channel-other";
    expect(process.env.META_PHONE_NUMBER_ID).toBe(fixture.channel);
    expect(otherChannel).not.toBe(fixture.channel);
    await processWebhookPayload(payload(textMessage(), otherChannel));
    expect(fixture.db.markMessageProcessed).toHaveBeenCalledExactlyOnceWith("synthetic-wamid-alpha");
    expect(fixture.db.getOrCreateConversation).toHaveBeenCalledExactlyOnceWith(fixture.phone, null);
    expect(fixture.db.insertMessage).toHaveBeenCalledWith(1, "user", "Hola", "synthetic-wamid-alpha");
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(
      fixture.phone, "¡Hola! 👋 Bienvenido a Terra. Explora nuestro catálogo y elige el producto que buscas.",
    );
    expect(fixture.meta.sendCatalogCtaMessage).toHaveBeenCalledExactlyOnceWith(
      fixture.phone, "https://catalog.invalid/?checkout=synthetic-checkout-token",
    );
    expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
  });

  it("KNOWN DEFECT OBSERVED: a CTA accepted by Meta followed by a local persistence failure sends a fallback", async () => {
    const sequence: string[] = [];
    fixture.messages.push({ id: 1, role: "user", content: "Mensaje anterior simulado", wa_message_id: "synthetic-earlier" });
    fixture.meta.sendCatalogCtaMessage.mockImplementationOnce(async () => {
      sequence.push("cta-accepted");
      return { wa_message_id: "synthetic-accepted-cta" };
    });
    fixture.db.updateMessageWaId.mockImplementation((_id: number, wamid: string) => {
      if (wamid === "synthetic-accepted-cta") {
        sequence.push("persistence-failed");
        throw new Error("simulated local persistence failure after provider acceptance");
      }
    });
    fixture.meta.sendTextMessage.mockImplementationOnce(async () => {
      sequence.push("fallback-sent");
      return { wa_message_id: "synthetic-accepted-fallback" };
    });
    await processWebhookPayload(payload(textMessage("synthetic-catalog-request", "catalogo")));
    expect(sequence).toEqual(["cta-accepted", "persistence-failed", "fallback-sent"]);
    expect(fixture.meta.sendCatalogCtaMessage).toHaveBeenCalledTimes(1);
    expect(fixture.db.updateMessageWaId).toHaveBeenCalledWith(expect.any(Number), "synthetic-accepted-cta");
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(
      fixture.phone, "No pudimos abrir el catálogo ahora. Escríbenos qué producto buscas y te ayudamos.",
    );
    expect(fixture.db.updateMessageWaId).toHaveBeenCalledWith(expect.any(Number), "synthetic-accepted-fallback");
  });

  it("KNOWN DEFECT OBSERVED: an image received in HUMAN mode records a proof and sends an automatic acknowledgment", async () => {
    fixture.mode = "HUMAN";
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(order());
    await processWebhookPayload(payload({
      id: "synthetic-image", from: fixture.phone, type: "image", image: { id: "synthetic-media-not-downloadable" },
    }));
    expect(fixture.db.getOrCreateConversation).toHaveBeenCalledExactlyOnceWith(fixture.phone, null);
    expect(fixture.db.getOrCreateConversation.mock.results[0].value.mode).toBe("HUMAN");
    expect(fixture.mode).toBe("HUMAN");
    expect(fixture.db.getLatestActiveCatalogOrderForConversation).toHaveBeenCalledExactlyOnceWith(1);
    expect(fixture.db.markCatalogOrderPaymentProof).toHaveBeenCalledExactlyOnceWith("synthetic-order-alpha");
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(
      fixture.phone, "✅ Recibimos el comprobante del pedido #T-TEST-DEMO. Está en revisión; el pago no se aprueba automáticamente.",
    );
  });

  it("KNOWN DEFECT OBSERVED: a location received in HUMAN mode is saved and automatically dispatches a payment QR", async () => {
    fixture.mode = "HUMAN";
    fixture.db.getLocationRequestedCatalogOrderForConversation.mockReturnValue(order("awaiting_location"));
    await processWebhookPayload(payload({
      id: "synthetic-location", from: fixture.phone, type: "location",
      // Fictitious neutral coordinates, never read from any customer's location.
      location: { latitude: 0, longitude: 0, name: "Synthetic fixture" },
    }));
    expect(fixture.db.getOrCreateConversation).toHaveBeenCalledExactlyOnceWith(fixture.phone, null);
    expect(fixture.db.getOrCreateConversation.mock.results[0].value.mode).toBe("HUMAN");
    expect(fixture.mode).toBe("HUMAN");
    expect(fixture.db.getLocationRequestedCatalogOrderForConversation).toHaveBeenCalledExactlyOnceWith(1);
    expect(fixture.db.saveCatalogOrderLocation).toHaveBeenCalledExactlyOnceWith("synthetic-order-alpha", {
      latitude: 0, longitude: 0, name: "Synthetic fixture", address: null,
    });
    expect(fixture.dispatchCatalogPaymentQr).toHaveBeenCalledExactlyOnceWith("synthetic-order-alpha");
    expect(fixture.meta.sendTextMessage).not.toHaveBeenCalled();
  });

  it("KNOWN DEFECT OBSERVED: a pending RAG response is sent after an operator switches the chat to HUMAN", async () => {
    const reply = deferred<{ content: string; needsAdvisorConfirmation: boolean }>();
    const modesAtSend: string[] = [];
    fixture.meta.sendTextMessage.mockImplementationOnce(async () => {
      modesAtSend.push(fixture.mode);
      return { wa_message_id: "synthetic-accepted-rag" };
    });
    fixture.generateAssistantReply.mockReturnValueOnce(reply.promise);
    expect(fixture.mode).toBe("AI");
    const processing = processWebhookPayload(payload(textMessage("synthetic-rag", "¿Cuáles son los horarios de atención?")));
    expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendTextMessage).not.toHaveBeenCalled();
    fixture.mode = "HUMAN";
    reply.resolve({ content: "Horario público simulado.", needsAdvisorConfirmation: false });
    await processing;
    expect(modesAtSend).toEqual(["HUMAN"]);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(fixture.phone, "Horario público simulado.");
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
  });
});
