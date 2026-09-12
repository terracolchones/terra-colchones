import type { Conversation } from "@/lib/db";
import type { MessageKind, MessageStatus } from "@/lib/meta/diagnostics";
import { HUMAN_HANDOFF_REPLY } from "@/lib/handoff";
import { containsUnsafeCheckoutReply, hasSensitiveCommerceData, isControlledCheckoutTopic, isKnowledgeQuestion, requestsGeneralInformation, requestsHumanSupport, shouldSendCatalog, isIdentityQuestion, declinesHumanSupport, isAcknowledgment, requestsOrderChange, isCatalogRequest, requestsCheckoutAction, isOrderConfirmationRequest } from "@/lib/message-routing";
import { ADVISOR_NOTICE } from "@/lib/behavior/instructions";
import { parseOrderConfirmationCode } from "@/lib/order-code";

/** Provider and storage boundaries are injected so the exact flow can run offline. */
export interface WebhookDependencies {
  db: Pick<typeof import("@/lib/db"),
    | "claimCatalogOrder"
    | "createCatalogCheckoutSession"
    | "getCatalogLeadContext"
    | "getConversationById"
    | "getLatestActiveCatalogOrderForConversation"
    | "getUnambiguousActiveCatalogOrderForConversation"
    | "getLocationRequestedCatalogOrderForConversation"
    | "getOrCreateConversation"
    | "getRecentHistory"
    | "insertMessage"
    | "markMessageProcessed"
    | "markCatalogOrderPaymentProof"
    | "saveCatalogOrderLocation"
    | "setCatalogLeadContext"
    | "setMode"
    | "updateMessageWaId"
    | "wasMessageProcessed"
  >;
  getProductForCatalogLead: typeof import("@/lib/catalog-storefront/server").getProductForCatalogLead;
  parseCatalogLeadContext: typeof import("@/lib/catalog-storefront/whatsapp").parseCatalogLeadContext;
  dispatchCatalogLocationRequest: typeof import("@/lib/catalog-order-flow").dispatchCatalogLocationRequest;
  dispatchCatalogPaymentQr: typeof import("@/lib/catalog-payment-flow").dispatchCatalogPaymentQr;
  generateAssistantReply: typeof import("@/lib/openai").generateAssistantReply;
  sendCatalogCtaMessage: typeof import("@/lib/meta/client").sendCatalogCtaMessage;
  sendTextMessage: typeof import("@/lib/meta/client").sendTextMessage;
  diagnostic: typeof import("@/lib/meta/diagnostics").diagnostic;
  messageRef: typeof import("@/lib/meta/diagnostics").messageRef;
  channelId: () => string | undefined;
  publicAppUrl: () => string | undefined;
  publicCatalogUrl: () => string | undefined;
}

export type WebhookProcessor = (payload: unknown, origin?: string) => Promise<void>;

export function createWebhookProcessor(dependencies: WebhookDependencies): WebhookProcessor {
  const {
    db: { claimCatalogOrder, createCatalogCheckoutSession, getCatalogLeadContext, getConversationById, getLatestActiveCatalogOrderForConversation, getUnambiguousActiveCatalogOrderForConversation, getLocationRequestedCatalogOrderForConversation, getOrCreateConversation, getRecentHistory, insertMessage, markMessageProcessed, markCatalogOrderPaymentProof, saveCatalogOrderLocation, setCatalogLeadContext, setMode, updateMessageWaId, wasMessageProcessed },
    getProductForCatalogLead, parseCatalogLeadContext,
    dispatchCatalogLocationRequest, dispatchCatalogPaymentQr, generateAssistantReply,
    sendCatalogCtaMessage, sendTextMessage, diagnostic, messageRef,
  } = dependencies;

  type RecordValue = Record<string, unknown>;

  function isRecord(value: unknown): value is RecordValue {
    return typeof value === "object" && value !== null;
  }

  function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  function httpsBaseUrl(value: string | undefined): string | null {
    const candidate = (value || "").trim().replace(/\/$/, "");
    return candidate.startsWith("https://") ? candidate : null;
  }

  function publicBaseUrl(origin?: string): string | null {
    return httpsBaseUrl(dependencies.publicAppUrl() || origin);
  }

  /**
   * Permite alojar el agente y el catálogo en dominios distintos. Si no se
   * configura, conserva el destino histórico dentro de la misma aplicación.
   */
  function catalogPublicUrl(origin?: string): string | null {
    const configuredCatalogUrl = httpsBaseUrl(dependencies.publicCatalogUrl());
    if (configuredCatalogUrl) return configuredCatalogUrl;

    const agentBaseUrl = publicBaseUrl(origin);
    return agentBaseUrl ? agentBaseUrl + "/catalogo" : null;
  }

  /** Consultar de nuevo tras cada espera: el operador puede haber tomado el chat. */
  function canAutomate(conversation: Conversation): boolean {
    const allowed = getConversationById(conversation.id)?.mode === "AI";
    if (!allowed) diagnostic({ event: "message.mode_suppressed" });
    return allowed;
  }

  function reserveIncomingMessage(waMessageId: string, kind: MessageKind): boolean {
    if (wasMessageProcessed(waMessageId) || !markMessageProcessed(waMessageId)) {
      diagnostic({ event: "message.duplicate_ignored", kind, message_ref: messageRef(waMessageId) });
      return false;
    }
    diagnostic({ event: "message.received", kind, message_ref: messageRef(waMessageId) });
    return true;
  }

  async function sendAndStore(
    conversation: Conversation,
    phone: string,
    content: string,
    options: { humanHandoffAcknowledgment?: boolean } = {},
  ): Promise<void> {
    const current = getConversationById(conversation.id);
    if (!current || (current.mode !== "AI" && !(options.humanHandoffAcknowledgment && current.mode === "HUMAN"))) {
      diagnostic({ event: "message.mode_suppressed", kind: "text" });
      return;
    }
    const id = insertMessage(conversation.id, "assistant", content);
    const { wa_message_id } = await sendTextMessage(phone, content);
    try {
      updateMessageWaId(id, wa_message_id);
    } catch {
      // Meta ya aceptó el envío. Un fallo local no autoriza otro mensaje.
      diagnostic({ event: "history.persistence_failed", kind: "text", message_ref: messageRef(wa_message_id) });
    }
  }

  /** Activa atención humana antes de avisar al cliente, para que el dashboard lo muestre de inmediato. */
  async function handoffToHuman(conversation: Conversation, phone: string): Promise<void> {
    setMode(conversation.id, "HUMAN");
    await sendAndStore(conversation, phone, HUMAN_HANDOFF_REPLY, { humanHandoffAcknowledgment: true });
  }

  /** Envía el catálogo con un identificador opaco cuando el chat ya existe. */
  async function sendCatalog(
    conversation: Conversation,
    phone: string,
    origin?: string,
  ): Promise<void> {
    if (!canAutomate(conversation)) return;
    const catalogUrl = catalogPublicUrl(origin);
    if (!catalogUrl) {
      await sendAndStore(
        conversation,
        phone,
        "No pudimos abrir el catálogo porque falta configurar la URL pública segura del catálogo de Terra.",
      );
      return;
    }

    let checkoutUrl = catalogUrl;
    try {
      const checkoutToken = createCatalogCheckoutSession(conversation.id);
      const url = new URL(catalogUrl);
      url.searchParams.set("checkout", checkoutToken);
      checkoutUrl = url.toString();
    } catch {
      // El catálogo aún puede abrirse de forma directa; el código corto vinculará
      // el pedido cuando el cliente vuelva a escribir por WhatsApp.
      diagnostic({ event: "catalog.session_failed" });
    }

    if (!canAutomate(conversation)) return;
    const localId = insertMessage(conversation.id, "assistant", "Catálogo enviado.");
    let acceptedMessageId: string;
    try {
      const { wa_message_id } = await sendCatalogCtaMessage(phone, checkoutUrl);
      acceptedMessageId = wa_message_id;
    } catch {
      // Un error de transporte no prueba que Meta haya rechazado el mensaje.
      // Tampoco reenviar alternativas ante restricciones o límites del proveedor.
      diagnostic({ event: "send.failed", kind: "cta_url" });
      return;
    }
    try {
      updateMessageWaId(localId, acceptedMessageId);
    } catch {
      diagnostic({ event: "history.persistence_failed", kind: "cta_url", message_ref: messageRef(acceptedMessageId) });
    }
  }

  /** Responde una duda sin sacar el chat del pedido que ya estaba en curso. */
  async function answerKnowledgeQuestion(
    conversation: Conversation,
    phone: string,
    activeOrder?: ReturnType<typeof getLatestActiveCatalogOrderForConversation>,
  ): Promise<void> {
    if (!canAutomate(conversation)) return;
    let content: string;
    try {
      const startedAt = Date.now();
      const reply = await generateAssistantReply(
        getRecentHistory(conversation.id, 20),
        activeOrder ? { productId: activeOrder.product_id, variantId: activeOrder.variant_id } : getCatalogLeadContext(conversation.id),
        activeOrder ? { orderStatus: activeOrder.status, productName: activeOrder.product_name, variantLabel: activeOrder.variant_label } : {},
      );
      diagnostic({ event: "rag.completed", elapsed_ms: Date.now() - startedAt });
      content = reply.needsAdvisorConfirmation || containsUnsafeCheckoutReply(reply.content)
        ? `Para darte ese dato con precisión, un asesor debe confirmarlo. ${ADVISOR_NOTICE}`
        : reply.content;
    } catch {
      diagnostic({ event: "rag.failed" });
      content = `No pudimos consultar esa información ahora. ${ADVISOR_NOTICE}`;
    }
    try {
      // sendAndStore vuelve a comprobar el modo después de la consulta LLM.
      await sendAndStore(conversation, phone, content);
    } catch {
      // Fallar enviando no equivale a fallar consultando el RAG: nunca encadenar
      // una segunda respuesta cuando el resultado de transporte sea incierto.
      diagnostic({ event: "send.failed", kind: "text" });
    }
  }

  async function handleTextMessage(message: RecordValue, contactName: string | null, origin?: string): Promise<void> {
    const textData = isRecord(message.text) ? message.text : undefined;
    const waMessageId = typeof message.id === "string" ? message.id : undefined;
    const phone = typeof message.from === "string" ? message.from : undefined;
    const content = typeof textData?.body === "string" ? textData.body.trim() : "";
    if (!waMessageId || !phone || !content) return;
    if (!reserveIncomingMessage(waMessageId, "text")) return;
    const conversation = getOrCreateConversation(phone, contactName);
    const messageCountBefore = getRecentHistory(conversation.id, 1).length;
    insertMessage(conversation.id, "user", content, waMessageId);
    if (!canAutomate(conversation)) {
      // HUMAN pauses outbound automation, not an explicit customer's confirmation.
      // This synchronous branch does not request GPS or send any acknowledgment.
      if (getConversationById(conversation.id)?.mode === "HUMAN" && isOrderConfirmationRequest(content)) {
        const code = parseOrderConfirmationCode(content);
        if (code) claimCatalogOrder(code, conversation.id);
      }
      return;
    }

    // Las preferencias del cliente preceden a cualquier selección o acción.
    if (requestsHumanSupport(content)) {
      await handoffToHuman(conversation, phone);
      return;
    }
    if (isIdentityQuestion(content)) {
      await sendAndStore(conversation, phone, `Soy el asistente virtual de Terra y puedo ayudarte con tus consultas. ${ADVISOR_NOTICE}`);
      return;
    }
    if (declinesHumanSupport(content)) {
      await sendAndStore(conversation, phone, "Claro, seguimos por aquí. ¿Qué te gustaría consultar?");
      return;
    }
    if (requestsOrderChange(content)) {
      await sendAndStore(conversation, phone, `Un asesor puede revisar el cambio o la cancelación que solicitas; todavía no se ha realizado. ${ADVISOR_NOTICE}`);
      return;
    }
    if (isAcknowledgment(content)) {
      await sendAndStore(conversation, phone, "¡Con gusto! Aquí estoy si necesitas algo más.");
      return;
    }

    // Los enlaces del catálogo llevan un identificador estable y se atienden
    // antes de cualquier respuesta genérica.
    const catalogLead = parseCatalogLeadContext(content);
    if (catalogLead) {
      setCatalogLeadContext(conversation.id, catalogLead.productId, catalogLead.variantId);
      const selection = await getProductForCatalogLead(catalogLead.productId, catalogLead.variantId);
      const productLabel = selection
        ? selection.product.name + (selection.variant ? " · " + selection.variant.label : "")
        : "el producto que elegiste";
      await sendAndStore(
        conversation,
        phone,
        "¡Hola! Te ayudo con " + productLabel + ". ¿Deseas que confirmemos disponibilidad y entrega para tu ciudad?",
      );
      return;
    }

    const orderCode = parseOrderConfirmationCode(content);
    // Mencionar un código en una pregunta no confirma ni vincula un pedido.
    if (orderCode && isOrderConfirmationRequest(content)) {
      const claimed = claimCatalogOrder(orderCode, conversation.id);
      if (claimed.result === "claimed" && claimed.order) {
        await sendAndStore(
          conversation,
          phone,
          `✅ Pedido #${claimed.order.public_code} confirmado. Ahora comparte tu ubicación con el botón de WhatsApp para coordinar la entrega. ${ADVISOR_NOTICE}`,
        );
        if (!canAutomate(conversation)) return;
        const delivery = await dispatchCatalogLocationRequest(claimed.order.id);
        if (delivery === "failed") {
          await sendAndStore(
            conversation,
            phone,
            "No pudimos mostrar el botón de ubicación todavía. Escríbenos “ubicación” y lo reintentaremos.",
          );
        }
        return;
      }
      if (claimed.result === "already_confirmed" && claimed.order) {
        await sendAndStore(
          conversation,
          phone,
          `Tu pedido #${claimed.order.public_code} ya está en proceso. Sigue las indicaciones que aparecen en este chat.`,
        );
        return;
      }
      await sendAndStore(
        conversation,
        phone,
        claimed.result === "belongs_to_other_chat"
          ? "Ese código fue creado desde otro chat de WhatsApp. Abre el pedido desde esa conversación para continuar."
          : "No encontramos ese código de pedido. Vuelve a confirmar el producto desde el catálogo.",
      );
      return;
    }

    const activeOrder = getLatestActiveCatalogOrderForConversation(conversation.id);
    // El estado del comprobante pertenece al pedido, no a documentos comerciales.
    // Consultarlo nunca valida el pago ni ejecuta otro paso del checkout.
    const paymentStatusQuestion = /\b(?:pago|comprobante)\b/i.test(content)
      && /\b(?:aprobaron|aprobado|validaron|validado|confirmaron|confirmado|revisaron|revisado|recibieron|recibido|estado|revisi[oó]n)\b/i.test(content)
      && /(?:[¿?]|\b(?:ya|saber|sigue|esta|está|estado)\b)/i.test(content);
    if (paymentStatusQuestion && activeOrder?.status === "payment_proof_received") {
      await sendAndStore(conversation, phone, "Tu comprobante está en revisión por el equipo. Todavía no tengo una confirmación de aprobación del pago.");
      return;
    }
    if (paymentStatusQuestion && activeOrder?.status === "awaiting_payment") {
      await sendAndStore(conversation, phone, `Todavía no tengo un comprobante registrado para este pedido. Si ya lo enviaste, un asesor puede revisar qué ocurrió. ${ADVISOR_NOTICE}`);
      return;
    }
    if (activeOrder && hasSensitiveCommerceData(content) && !requestsCheckoutAction(content)) {
      await sendAndStore(conversation, phone, `Un asesor puede revisar ese dato de tu pedido. ${ADVISOR_NOTICE}`);
      return;
    }
    // Explorar otra vez conserva el pedido existente y sus reservas de envío.
    if (activeOrder && isCatalogRequest(content)) {
      await sendCatalog(conversation, phone, origin);
      return;
    }
    if (requestsGeneralInformation(content) && !hasSensitiveCommerceData(content) && !isControlledCheckoutTopic(content)) {
      await sendAndStore(conversation, phone, "Claro, ¿qué deseas saber sobre Terra, sus productos o tu pedido?");
      return;
    }
    // Una duda comercial no debe cortar la venta. Las acciones sensibles de
    // ubicación, QR, pago y comprobante mantienen el flujo transaccional.
    if (activeOrder && isKnowledgeQuestion(content) && !hasSensitiveCommerceData(content) && !isControlledCheckoutTopic(content)) {
      await answerKnowledgeQuestion(conversation, phone, activeOrder);
      return;
    }
    // Una objeción o conversación normal no debe ejecutar el paso transaccional.
    if (activeOrder && !hasSensitiveCommerceData(content) && !requestsCheckoutAction(content)
      && !isControlledCheckoutTopic(content)) {
      await answerKnowledgeQuestion(conversation, phone, activeOrder);
      return;
    }
    if (activeOrder?.status === "awaiting_chat_confirmation") {
      await sendAndStore(
        conversation,
        phone,
        `Tu pedido #${activeOrder.public_code} está listo. Envía el mensaje de confirmación que abrió el catálogo para continuar.`,
      );
      return;
    }
    if (activeOrder?.status === "awaiting_location") {
      if (activeOrder.latitude !== null && activeOrder.longitude !== null) {
        // Haber guardado GPS no autoriza enviar un QR ante cualquier texto nuevo.
        if (!requestsCheckoutAction(content) || !/\bqr\b/i.test(content)) {
          await sendAndStore(conversation, phone, `Tu ubicación está registrada. El siguiente paso del pedido está pendiente de revisión. ${ADVISOR_NOTICE}`);
          return;
        }
        if (!canAutomate(conversation)) return;
        const delivery = await dispatchCatalogPaymentQr(activeOrder.id);
        if (delivery === "failed") {
          await sendAndStore(
            conversation,
            phone,
            "📍 Tu ubicación ya está registrada. El QR de pago está pendiente por un inconveniente técnico; no necesitas enviar nada más por ahora.",
          );
        } else if (delivery === "in_progress") {
          await sendAndStore(conversation, phone, "El envío del QR está pendiente de confirmación. No lo repetiremos automáticamente; un asesor debe revisarlo.");
        }
        return;
      }
      await sendAndStore(
        conversation,
        phone,
        activeOrder.location_requested === 1
          ? "📍 Comparte tu ubicación usando el botón de WhatsApp que te enviamos para continuar."
          : "Tu pedido está registrado. Estamos preparando la solicitud de ubicación.",
      );
      return;
    }
    if (activeOrder?.status === "awaiting_payment") {
      await sendAndStore(
        conversation,
        phone,
        "Envía la imagen de tu comprobante por este chat. El pago será revisado por el equipo antes del despacho.",
      );
      return;
    }
    if (activeOrder?.status === "payment_proof_received") {
      await sendAndStore(
        conversation,
        phone,
        "Tu comprobante está en revisión. Te confirmaremos el siguiente paso por este chat; el pago no se aprueba automáticamente.",
      );
      return;
    }

    if (hasSensitiveCommerceData(content)) {
      await sendAndStore(
        conversation,
        phone,
        "Para continuar con GPS, QR o comprobante, primero confirma un producto desde el catálogo. Si ya tienes un código de pedido, envíalo en este chat.",
      );
      return;
    }

    if (shouldSendCatalog(content, messageCountBefore)) {
      if (messageCountBefore === 0) {
        await sendAndStore(
          conversation,
          phone,
          "¡Hola! 👋 Bienvenido a Terra. Explora nuestro catálogo y elige el producto que buscas. Si prefieres atención humana, escribe \"asesor\".",
        );
      }
      await sendCatalog(conversation, phone, origin);
      return;
    }

    await answerKnowledgeQuestion(conversation, phone);
  }

  async function handleLocationMessage(message: RecordValue, contactName: string | null): Promise<void> {
    const waMessageId = typeof message.id === "string" ? message.id : undefined;
    const phone = typeof message.from === "string" ? message.from : undefined;
    const location = isRecord(message.location) ? message.location : undefined;
    const latitude = typeof location?.latitude === "number" ? location.latitude : Number.NaN;
    const longitude = typeof location?.longitude === "number" ? location.longitude : Number.NaN;
    if (!waMessageId || !phone || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
    if (!reserveIncomingMessage(waMessageId, "location")) return;

    const conversation = getOrCreateConversation(phone, contactName);
    insertMessage(conversation.id, "user", "Ubicación de entrega recibida.", waMessageId);
    if (!canAutomate(conversation)) {
      if (getConversationById(conversation.id)?.mode !== "HUMAN") return;
      const manualOrder = getUnambiguousActiveCatalogOrderForConversation(conversation.id);
      if (manualOrder?.status === "awaiting_location" && manualOrder.conversation_id === conversation.id) {
        saveCatalogOrderLocation(manualOrder.id, {
          latitude, longitude,
          name: typeof location?.name === "string" ? location.name : null,
          address: typeof location?.address === "string" ? location.address : null,
        }, { humanConversationId: conversation.id });
      }
      return;
    }
    const order = getLocationRequestedCatalogOrderForConversation(conversation.id);
    if (!order) {
      await sendAndStore(conversation, phone, "Primero confirma tu pedido desde el catálogo para que podamos usar tu ubicación.");
      return;
    }

    const saved = saveCatalogOrderLocation(order.id, {
      latitude,
      longitude,
      name: typeof location?.name === "string" ? location.name : null,
      address: typeof location?.address === "string" ? location.address : null,
    });
    if (!saved.saved || !canAutomate(conversation)) return;
    const delivery = await dispatchCatalogPaymentQr(order.id);
    if (delivery === "failed") {
      await sendAndStore(
        conversation,
        phone,
        "📍 Recibimos tu ubicación. El QR de pago está pendiente por un inconveniente técnico; no necesitas enviar nada más por ahora.",
      );
    }
  }

  async function handleImageMessage(message: RecordValue, contactName: string | null): Promise<void> {
    const waMessageId = typeof message.id === "string" ? message.id : undefined;
    const phone = typeof message.from === "string" ? message.from : undefined;
    if (!waMessageId || !phone || !reserveIncomingMessage(waMessageId, "image")) return;

    const conversation = getOrCreateConversation(phone, contactName);
    insertMessage(conversation.id, "user", "Comprobante de pago recibido.", waMessageId);
    if (!canAutomate(conversation)) {
      if (getConversationById(conversation.id)?.mode !== "HUMAN") return;
      const manualOrder = getUnambiguousActiveCatalogOrderForConversation(conversation.id);
      if (manualOrder?.status === "awaiting_payment" && manualOrder.conversation_id === conversation.id) {
        markCatalogOrderPaymentProof(manualOrder.id, { humanConversationId: conversation.id });
      }
      return;
    }
    const order = getLatestActiveCatalogOrderForConversation(conversation.id);
    if (!order || order.status !== "awaiting_payment") return;
    markCatalogOrderPaymentProof(order.id);
    await sendAndStore(
      conversation,
      phone,
      `✅ Recibimos el comprobante del pedido #${order.public_code}. Está en revisión; el pago no se aprueba automáticamente.`,
    );
  }

  /**
   * Los botones que puedan quedar en conversaciones antiguas no reactivan el
   * checkout retirado: llevan al cliente al catálogo nuevo.
   */
  async function handleInteractiveEntry(message: RecordValue, contactName: string | null, origin?: string): Promise<void> {
    const waMessageId = typeof message.id === "string" ? message.id : undefined;
    const phone = typeof message.from === "string" ? message.from : undefined;
    if (!waMessageId || !phone) return;
    if (!reserveIncomingMessage(waMessageId, "interactive")) return;

    const conversation = getOrCreateConversation(phone, contactName);
    insertMessage(conversation.id, "user", "Interacción recibida.", waMessageId);
    if (!canAutomate(conversation)) return;
    await sendCatalog(conversation, phone, origin);
  }

  async function processWebhookPayload(payload: unknown, origin?: string): Promise<void> {
    if (!isRecord(payload) || payload.object !== "whatsapp_business_account") return;
    const expectedPhoneId = dependencies.channelId();
    // Fallar cerrado sin reservar WAMIDs ni escribir conversaciones. No normalizar
    // el identificador: el cliente de envío debe usar exactamente el mismo valor.
    if (typeof expectedPhoneId !== "string" || !expectedPhoneId || expectedPhoneId.trim() !== expectedPhoneId) {
      diagnostic({ event: "message.channel_ignored" });
      return;
    }
    for (const entry of asArray(payload.entry)) {
      if (!isRecord(entry)) continue;
      for (const change of asArray(entry.changes)) {
        if (!isRecord(change) || change.field !== "messages" || !isRecord(change.value)) continue;
        const value = change.value;
        const metadata = isRecord(value.metadata) ? value.metadata : undefined;
        if (typeof metadata?.phone_number_id !== "string" || metadata.phone_number_id !== expectedPhoneId) {
          diagnostic({ event: "message.channel_ignored" });
          continue;
        }
        for (const status of asArray(value.statuses)) {
          if (isRecord(status)) {
            const statusName: MessageStatus = typeof status.status === "string"
              && ["sent", "delivered", "read", "failed", "deleted"].includes(status.status)
              ? status.status as MessageStatus : "unknown";
            const errorCodes = asArray(status.errors).flatMap((error) => isRecord(error) && typeof error.code === "number" ? [error.code] : []);
            diagnostic({ event: "message.status", message_ref: messageRef(status.id), status: statusName, error_codes: errorCodes });
          }
        }
        const namesByPhone = new Map<string, string | null>();
        for (const contact of asArray(value.contacts)) {
          if (!isRecord(contact) || typeof contact.wa_id !== "string") continue;
          const profile = isRecord(contact.profile) ? contact.profile : undefined;
          namesByPhone.set(contact.wa_id, typeof profile?.name === "string" ? profile.name : null);
        }
        for (const rawMessage of asArray(value.messages)) {
          if (!isRecord(rawMessage)) continue;
          const name = typeof rawMessage.from === "string" ? namesByPhone.get(rawMessage.from) ?? null : null;
          if (rawMessage.type === "text") {
            await handleTextMessage(rawMessage, name, origin);
          } else if (rawMessage.type === "interactive") {
            await handleInteractiveEntry(rawMessage, name, origin);
          } else if (rawMessage.type === "location") {
            await handleLocationMessage(rawMessage, name);
          } else if (rawMessage.type === "image") {
            await handleImageMessage(rawMessage, name);
          } else {
            diagnostic({ event: "message.unsupported", kind: "unknown", message_ref: messageRef(rawMessage.id) });
          }
        }
      }
    }
  }

  return processWebhookPayload;
}
