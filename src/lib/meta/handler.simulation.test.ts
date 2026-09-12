import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Offline characterization of the production handler, not a WhatsApp test.
 * Every persistence / provider boundary is replaced before importing it.
 * All aliases, messages, media and coordinates below are invented fixtures.
 * These mocks do NOT demonstrate SQLite concurrency or Meta's ban decisions.
 *
 * D1-D5 cases now assert the corrected safe behavior, not an expected failure.
 * The distinct-WAMID scenario remains explicitly a baseline observation: this
 * patch does not introduce a durable queue or serialize different messages.
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
  vi.spyOn(console, "info").mockImplementation(() => undefined);
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
  fixture.db.getUnambiguousActiveCatalogOrderForConversation.mockReturnValue(undefined);
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
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(
      fixture.phone,
      "¡Hola! 👋 Bienvenido a Terra. Explora nuestro catálogo y elige el producto que buscas. Si quieres hablar con un asesor, escribe \"asesor\".",
    );
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

  it("the advertised literal asesor switches to HUMAN once, with no RAG, CTA or repeated acknowledgment", async () => {
    fixture.meta.sendTextMessage.mockImplementationOnce(async () => {
      expect(fixture.mode).toBe("HUMAN");
      return { wa_message_id: "synthetic-literal-human-ack" };
    });
    const event = payload(textMessage("synthetic-literal-human-request", "asesor"));
    await processWebhookPayload(event);
    await processWebhookPayload(event);
    await processWebhookPayload(payload(textMessage("synthetic-second-human-request", "asesor")));

    expect(fixture.mode).toBe("HUMAN");
    expect(fixture.db.setMode).toHaveBeenCalledExactlyOnceWith(1, "HUMAN");
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(
      fixture.phone, "Perfecto, te conecto con un asesor comercial para ayudarte a avanzar.",
    );
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
    expect(fixture.generateAssistantReply).not.toHaveBeenCalled();
    expect(fixture.dispatchCatalogLocationRequest).not.toHaveBeenCalled();
    expect(fixture.dispatchCatalogPaymentQr).not.toHaveBeenCalled();
    expect(fixture.messages.filter((message) => message.role === "user")).toHaveLength(2);
  });
});

describe("D1-D5 safety regressions", () => {
  it("D1: a message addressed to another channel is ignored before reservation or any side effect", async () => {
    const otherChannel = "synthetic-channel-other";
    expect(process.env.META_PHONE_NUMBER_ID).toBe(fixture.channel);
    expect(otherChannel).not.toBe(fixture.channel);
    await processWebhookPayload(payload(textMessage(), otherChannel));
    expect(fixture.db.markMessageProcessed).not.toHaveBeenCalled();
    expect(fixture.db.getOrCreateConversation).not.toHaveBeenCalled();
    expect(fixture.db.insertMessage).not.toHaveBeenCalled();
    expectNoDelivery();
  });

  it("D2: a CTA accepted by Meta followed by a local persistence failure never sends a fallback", async () => {
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
    expect(sequence).toEqual(["cta-accepted", "persistence-failed"]);
    expect(fixture.meta.sendCatalogCtaMessage).toHaveBeenCalledTimes(1);
    expect(fixture.db.updateMessageWaId).toHaveBeenCalledWith(expect.any(Number), "synthetic-accepted-cta");
    expect(fixture.meta.sendTextMessage).not.toHaveBeenCalled();
    expect(fixture.db.updateMessageWaId).toHaveBeenCalledTimes(1);
  });

  it("D3: HUMAN records a proof against its unambiguous awaiting-payment order without approval or acknowledgment", async () => {
    fixture.mode = "HUMAN";
    fixture.db.getUnambiguousActiveCatalogOrderForConversation.mockReturnValue(order());
    await processWebhookPayload(payload({
      id: "synthetic-image", from: fixture.phone, type: "image", image: { id: "synthetic-media-not-downloadable" },
    }));
    expect(fixture.db.getOrCreateConversation).toHaveBeenCalledExactlyOnceWith(fixture.phone, null);
    expect(fixture.db.getOrCreateConversation.mock.results[0].value.mode).toBe("HUMAN");
    expect(fixture.mode).toBe("HUMAN");
    expect(fixture.db.insertMessage).toHaveBeenCalledExactlyOnceWith(1, "user", "Comprobante de pago recibido.", "synthetic-image");
    expect(fixture.db.getLatestActiveCatalogOrderForConversation).not.toHaveBeenCalled();
    expect(fixture.db.markCatalogOrderPaymentProof).toHaveBeenCalledExactlyOnceWith("synthetic-order-alpha", { humanConversationId: 1 });
    expectNoDelivery();
  });

  it("D4: HUMAN records native GPS only for the unambiguous confirmed order without sending QR", async () => {
    fixture.mode = "HUMAN";
    fixture.db.getUnambiguousActiveCatalogOrderForConversation.mockReturnValue({ ...order("awaiting_location"), location_requested: 0 });
    await processWebhookPayload(payload({
      id: "synthetic-location", from: fixture.phone, type: "location",
      // Fictitious neutral coordinates, never read from any customer's location.
      location: { latitude: 0, longitude: 0, name: "Synthetic fixture" },
    }));
    expect(fixture.db.getOrCreateConversation).toHaveBeenCalledExactlyOnceWith(fixture.phone, null);
    expect(fixture.db.getOrCreateConversation.mock.results[0].value.mode).toBe("HUMAN");
    expect(fixture.mode).toBe("HUMAN");
    expect(fixture.db.insertMessage).toHaveBeenCalledExactlyOnceWith(1, "user", "Ubicación de entrega recibida.", "synthetic-location");
    expect(fixture.db.getLocationRequestedCatalogOrderForConversation).not.toHaveBeenCalled();
    expect(fixture.db.saveCatalogOrderLocation).toHaveBeenCalledExactlyOnceWith("synthetic-order-alpha", {
      latitude: 0, longitude: 0, name: "Synthetic fixture", address: null,
    }, { humanConversationId: 1 });
    expectNoDelivery();
  });

  it("HUMAN records an exact customer confirmation once without a GPS request or acknowledgment", async () => {
    fixture.mode = "HUMAN";
    fixture.db.claimCatalogOrder.mockReturnValue({ result: "claimed", order: order("awaiting_location") });
    const event = payload(textMessage("synthetic-human-confirmation", "Hola Terra, confirmo mi pedido #T-TEST-DEMO"));
    await processWebhookPayload(event);
    await processWebhookPayload(event);
    expect(fixture.db.claimCatalogOrder).toHaveBeenCalledExactlyOnceWith("T-TEST-DEMO", 1);
    expect(fixture.mode).toBe("HUMAN");
    expectNoDelivery();
  });

  it.each(["No confirmo mi pedido #T-TEST-DEMO", "¿Cómo está mi pedido #T-TEST-DEMO?", "asesor"])(
    "HUMAN does not infer order confirmation from a mention: %s", async (content) => {
      fixture.mode = "HUMAN";
      await processWebhookPayload(payload(textMessage("synthetic-human-mention", content)));
      expect(fixture.db.claimCatalogOrder).not.toHaveBeenCalled();
      expectNoDelivery();
    },
  );

  it("HUMAN leaves a foreign-chat confirmation unclaimed and stays silent", async () => {
    fixture.mode = "HUMAN";
    fixture.db.claimCatalogOrder.mockReturnValue({ result: "belongs_to_other_chat", order: order("awaiting_chat_confirmation") });
    await processWebhookPayload(payload(textMessage("synthetic-foreign-confirmation", "Hola Terra, confirmo mi pedido #T-TEST-DEMO")));
    expect(fixture.db.claimCatalogOrder).toHaveBeenCalledExactlyOnceWith("T-TEST-DEMO", 1);
    expect(fixture.db.saveCatalogOrderLocation).not.toHaveBeenCalled();
    expectNoDelivery();
  });

  it.each([
    undefined, // Includes several possible orders: no arbitrary latest-order fallback.
    { ...order("awaiting_chat_confirmation") },
    { ...order("awaiting_payment") },
    { ...order("awaiting_location"), conversation_id: 2 },
  ])("HUMAN does not attach GPS without a unique confirmed order in its own chat: %j", async (candidate) => {
    fixture.mode = "HUMAN";
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(order("awaiting_location"));
    fixture.db.getUnambiguousActiveCatalogOrderForConversation.mockReturnValue(candidate);
    await processWebhookPayload(payload({ id: "synthetic-human-gps-ambiguous", from: fixture.phone, type: "location", location: { latitude: 0, longitude: 0 } }));
    expect(fixture.db.saveCatalogOrderLocation).not.toHaveBeenCalled();
    expect(fixture.db.getLatestActiveCatalogOrderForConversation).not.toHaveBeenCalled();
    expectNoDelivery();
  });

  it.each([undefined, order("awaiting_location"), { ...order("awaiting_payment"), conversation_id: 2 }])(
    "HUMAN does not mark proof without its unambiguous awaiting-payment order: %j", async (candidate) => {
      fixture.mode = "HUMAN";
      fixture.db.getUnambiguousActiveCatalogOrderForConversation.mockReturnValue(candidate);
      await processWebhookPayload(payload({ id: "synthetic-human-proof-ambiguous", from: fixture.phone, type: "image", image: { id: "synthetic-media" } }));
      expect(fixture.db.markCatalogOrderPaymentProof).not.toHaveBeenCalled();
      expectNoDelivery();
    },
  );

  it("HUMAN native GPS replay cannot record twice or trigger a QR", async () => {
    fixture.mode = "HUMAN";
    fixture.db.getUnambiguousActiveCatalogOrderForConversation.mockReturnValue(order("awaiting_location"));
    const event = payload({ id: "synthetic-human-gps-replay", from: fixture.phone, type: "location", location: { latitude: 0, longitude: 0 } });
    await processWebhookPayload(event);
    await processWebhookPayload(event);
    expect(fixture.db.saveCatalogOrderLocation).toHaveBeenCalledTimes(1);
    expectNoDelivery();
  });

  it.each([
    textMessage("synthetic-wrong-channel-confirm", "Hola Terra, confirmo mi pedido #T-TEST-DEMO"),
    { id: "synthetic-wrong-channel-gps", from: fixture.phone, type: "location", location: { latitude: 0, longitude: 0 } },
    { id: "synthetic-wrong-channel-proof", from: fixture.phone, type: "image", image: { id: "synthetic-media" } },
  ])("HUMAN does not record customer facts from an unauthorized channel: %j", async (message) => {
    fixture.mode = "HUMAN";
    await processWebhookPayload(payload(message, "synthetic-other-channel"));
    expect(fixture.db.markMessageProcessed).not.toHaveBeenCalled();
    expect(fixture.db.claimCatalogOrder).not.toHaveBeenCalled();
    expect(fixture.db.saveCatalogOrderLocation).not.toHaveBeenCalled();
    expect(fixture.db.markCatalogOrderPaymentProof).not.toHaveBeenCalled();
    expect(fixture.db.insertMessage).not.toHaveBeenCalled();
    expectNoDelivery();
  });

  it.each([{ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }])(
    "HUMAN rejects impossible native GPS values: %j", async (location) => {
      fixture.mode = "HUMAN";
      await processWebhookPayload(payload({ id: "synthetic-invalid-gps", from: fixture.phone, type: "location", location }));
      expect(fixture.db.saveCatalogOrderLocation).not.toHaveBeenCalled();
      expect(fixture.db.insertMessage).not.toHaveBeenCalled();
      expectNoDelivery();
    },
  );

  it("D5: a pending RAG response is suppressed after an operator switches the chat to HUMAN", async () => {
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
    expect(modesAtSend).toEqual([]);
    expect(fixture.meta.sendTextMessage).not.toHaveBeenCalled();
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
  });

  it.each([
    { label: "missing metadata", metadata: undefined },
    { label: "null metadata", metadata: null },
    { label: "array metadata", metadata: [] },
    { label: "missing channel", metadata: {} },
    { label: "null channel", metadata: { phone_number_id: null } },
    { label: "numeric channel", metadata: { phone_number_id: 123 } },
    { label: "empty channel", metadata: { phone_number_id: "" } },
    { label: "whitespace channel", metadata: { phone_number_id: ` ${fixture.channel} ` } },
  ])("D1: rejects $label before deduplication or persistence", async ({ metadata }) => {
    const event = payload(textMessage());
    Reflect.set(event.entry[0].changes[0].value, "metadata", metadata);
    await processWebhookPayload(event);
    expect(fixture.db.wasMessageProcessed).not.toHaveBeenCalled();
    expect(fixture.db.markMessageProcessed).not.toHaveBeenCalled();
    expect(fixture.db.getOrCreateConversation).not.toHaveBeenCalled();
    expect(fixture.db.insertMessage).not.toHaveBeenCalled();
    expectNoDelivery();
  });

  it.each([
    { label: "missing", configured: undefined },
    { label: "empty", configured: "" },
    { label: "whitespace", configured: " " },
    { label: "padded", configured: ` ${fixture.channel}` },
  ])("D1: fails closed when configured channel is $label", async ({ configured }) => {
    vi.stubEnv("META_PHONE_NUMBER_ID", configured);
    await processWebhookPayload(payload(textMessage()));
    expect(fixture.db.markMessageProcessed).not.toHaveBeenCalled();
    expect(fixture.db.insertMessage).not.toHaveBeenCalled();
    expectNoDelivery();
  });

  it("D1: ignores an unauthorized change but still handles an authorized change in the same payload", async () => {
    const event = payload(textMessage("synthetic-shared-wamid"), "synthetic-channel-other");
    event.entry[0].changes.push(payload(textMessage("synthetic-shared-wamid")).entry[0].changes[0]);
    await processWebhookPayload(event);
    expect(fixture.db.markMessageProcessed).toHaveBeenCalledExactlyOnceWith("synthetic-shared-wamid");
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendCatalogCtaMessage).toHaveBeenCalledTimes(1);
  });

  it("D2: an uncertain CTA transport failure neither retries nor sends a fallback", async () => {
    fixture.messages.push({ id: 1, role: "user", content: "Mensaje previo simulado", wa_message_id: "synthetic-prior" });
    fixture.meta.sendCatalogCtaMessage.mockRejectedValueOnce(new Error("synthetic uncertain transport result"));
    await processWebhookPayload(payload(textMessage("synthetic-uncertain-cta", "catalogo")));
    expect(fixture.meta.sendCatalogCtaMessage).toHaveBeenCalledTimes(1);
    expect(fixture.db.updateMessageWaId).not.toHaveBeenCalled();
    expect(fixture.meta.sendTextMessage).not.toHaveBeenCalled();
  });

  it("D2: a RAG text accepted before a persistence failure never triggers a second response", async () => {
    fixture.db.updateMessageWaId.mockImplementationOnce(() => { throw new Error("synthetic persistence failure"); });
    await processWebhookPayload(payload(textMessage("synthetic-rag-store-fail", "¿Cuáles son los horarios?")));
    expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(fixture.phone, "Respuesta pública simulada.");
    expect(fixture.db.updateMessageWaId).toHaveBeenCalledTimes(1);
  });

  it("D2: an uncertain RAG send never triggers a fallback response", async () => {
    fixture.meta.sendTextMessage.mockRejectedValueOnce(new Error("synthetic uncertain transport result"));
    await processWebhookPayload(payload(textMessage("synthetic-rag-send-fail", "¿Cuáles son los horarios?")));
    expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(fixture.phone, "Respuesta pública simulada.");
    expect(fixture.db.updateMessageWaId).not.toHaveBeenCalled();
  });

  it("D5: switching to HUMAN while the greeting is pending suppresses the following catalog CTA", async () => {
    const greeting = deferred<{ wa_message_id: string }>();
    fixture.meta.sendTextMessage.mockReturnValueOnce(greeting.promise);
    const processing = processWebhookPayload(payload(textMessage()));
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    fixture.mode = "HUMAN";
    greeting.resolve({ wa_message_id: "synthetic-accepted-greeting" });
    await processing;
    expect(fixture.db.updateMessageWaId).toHaveBeenCalledWith(expect.any(Number), "synthetic-accepted-greeting");
    expect(fixture.db.createCatalogCheckoutSession).not.toHaveBeenCalled();
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
  });

  it("D5: switching to HUMAN during catalog lookup suppresses its delayed product reply", async () => {
    const selection = deferred<null>();
    fixture.parseCatalogLeadContext.mockReturnValueOnce({ productId: "synthetic-product", variantId: null });
    fixture.getProductForCatalogLead.mockReturnValueOnce(selection.promise);
    const processing = processWebhookPayload(payload(textMessage("synthetic-product-lookup", "Producto seleccionado simulado")));
    expect(fixture.getProductForCatalogLead).toHaveBeenCalledExactlyOnceWith("synthetic-product", null);
    fixture.mode = "HUMAN";
    selection.resolve(null);
    await processing;
    expectNoDelivery();
  });

  it("D5: an already-started CTA remains recorded after HUMAN takeover, without another send", async () => {
    const cta = deferred<{ wa_message_id: string }>();
    fixture.messages.push({ id: 1, role: "user", content: "Mensaje previo simulado", wa_message_id: "synthetic-prior" });
    fixture.meta.sendCatalogCtaMessage.mockReturnValueOnce(cta.promise);
    const processing = processWebhookPayload(payload(textMessage("synthetic-cta-pending", "catalogo")));
    expect(fixture.meta.sendCatalogCtaMessage).toHaveBeenCalledTimes(1);
    fixture.mode = "HUMAN";
    cta.resolve({ wa_message_id: "synthetic-accepted-cta" });
    await processing;
    expect(fixture.db.updateMessageWaId).toHaveBeenCalledWith(expect.any(Number), "synthetic-accepted-cta");
    expect(fixture.meta.sendCatalogCtaMessage).toHaveBeenCalledTimes(1);
    expect(fixture.meta.sendTextMessage).not.toHaveBeenCalled();
  });

  it("D5: switching to HUMAN during order acknowledgment suppresses the following GPS dispatch", async () => {
    const acknowledgment = deferred<{ wa_message_id: string }>();
    fixture.db.claimCatalogOrder.mockReturnValueOnce({ result: "claimed", order: order("awaiting_location") });
    fixture.meta.sendTextMessage.mockReturnValueOnce(acknowledgment.promise);
    const processing = processWebhookPayload(payload(textMessage("synthetic-order-confirm", "Hola Terra, confirmo mi pedido #T-TEST-DEMO")));
    expect(fixture.db.claimCatalogOrder).toHaveBeenCalledExactlyOnceWith("T-TEST-DEMO", 1);
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    fixture.mode = "HUMAN";
    acknowledgment.resolve({ wa_message_id: "synthetic-accepted-order" });
    await processing;
    expect(fixture.dispatchCatalogLocationRequest).not.toHaveBeenCalled();
  });

  it("D5: a failed pending RAG request also remains silent after HUMAN takeover", async () => {
    let reject!: (error: Error) => void;
    const reply = new Promise<never>((_resolve, fail) => { reject = fail; });
    fixture.generateAssistantReply.mockReturnValueOnce(reply);
    const processing = processWebhookPayload(payload(textMessage("synthetic-rag-fail-human", "¿Cuáles son los horarios?")));
    expect(fixture.generateAssistantReply).toHaveBeenCalledTimes(1);
    fixture.mode = "HUMAN";
    reject(new Error("synthetic failed lookup"));
    await processing;
    expect(fixture.meta.sendTextMessage).not.toHaveBeenCalled();
    expect(fixture.meta.sendCatalogCtaMessage).not.toHaveBeenCalled();
  });

  it("diagnostics retain numeric delivery errors without raw provider IDs or error descriptions", async () => {
    const privateMarker = "synthetic-private-marker-not-real-data";
    await processWebhookPayload({ object: "whatsapp_business_account", entry: [{ changes: [{
      field: "messages", value: { metadata: { phone_number_id: fixture.channel }, statuses: [{
        id: privateMarker, status: "failed", errors: [
          { code: 131000, message: privateMarker, details: privateMarker },
          { code: -1 }, { code: "invalid" }, { code: Number.NaN },
        ],
      }] },
    }] }] });
    expect(console.info).toHaveBeenCalledTimes(1);
    const serialized = vi.mocked(console.info).mock.calls[0][1];
    expect(typeof serialized).toBe("string");
    const diagnosticRecord = JSON.parse(serialized as string);
    expect(diagnosticRecord).toMatchObject({ event: "message.status", status: "failed", error_codes: [131000] });
    expect(diagnosticRecord.message_ref).toMatch(/^[a-f0-9]{32}$/);
    expect(serialized).not.toContain(privateMarker);
    expectNoDelivery();
  });

  it("a failed RAG query logs only its closed diagnostic, not the exception content", async () => {
    const privateMarker = "synthetic-private-error-not-real-data";
    fixture.generateAssistantReply.mockRejectedValueOnce(new Error(privateMarker));
    await processWebhookPayload(payload(textMessage("synthetic-rag-private-error", "¿Cuáles son los horarios?")));
    const serialized = vi.mocked(console.info).mock.calls.map((call) => call[1]).join("\n");
    expect(serialized).toContain('"event":"rag.failed"');
    expect(serialized).not.toContain(privateMarker);
    expect(console.error).not.toHaveBeenCalled();
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(
      fixture.phone, 'No pudimos consultar esa información ahora. Si quieres hablar con un asesor, escribe "asesor".',
    );
  });
});

describe("preserved AI-mode commerce behavior", () => {
  it("keeps the AI image proof acknowledgment and marks it for review", async () => {
    fixture.db.getLatestActiveCatalogOrderForConversation.mockReturnValue(order());
    await processWebhookPayload(payload({ id: "synthetic-ai-image", from: fixture.phone, type: "image", image: { id: "synthetic-media" } }));
    expect(fixture.db.markCatalogOrderPaymentProof).toHaveBeenCalledExactlyOnceWith("synthetic-order-alpha");
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledExactlyOnceWith(
      fixture.phone, "✅ Recibimos el comprobante del pedido #T-TEST-DEMO. Está en revisión; el pago no se aprueba automáticamente.",
    );
    expect(fixture.mode).toBe("AI");
  });

  it("keeps the AI location-to-QR flow and suppresses a duplicate location WAMID", async () => {
    fixture.db.getLocationRequestedCatalogOrderForConversation.mockReturnValue(order("awaiting_location"));
    const event = payload({ id: "synthetic-ai-location", from: fixture.phone, type: "location", location: { latitude: 0, longitude: 0 } });
    await processWebhookPayload(event);
    await processWebhookPayload(event);
    expect(fixture.db.saveCatalogOrderLocation).toHaveBeenCalledExactlyOnceWith("synthetic-order-alpha", {
      latitude: 0, longitude: 0, name: null, address: null,
    });
    expect(fixture.dispatchCatalogPaymentQr).toHaveBeenCalledExactlyOnceWith("synthetic-order-alpha");
    expect(fixture.meta.sendTextMessage).not.toHaveBeenCalled();
  });

  it("keeps the AI order confirmation followed by exactly one GPS dispatch", async () => {
    fixture.db.claimCatalogOrder.mockReturnValueOnce({ result: "claimed", order: order("awaiting_location") });
    await processWebhookPayload(payload(textMessage("synthetic-ai-confirm", "Hola Terra, confirmo mi pedido #T-TEST-DEMO")));
    expect(fixture.meta.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(fixture.dispatchCatalogLocationRequest).toHaveBeenCalledExactlyOnceWith("synthetic-order-alpha");
  });
});
