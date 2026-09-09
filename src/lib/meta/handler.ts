import {
  claimCatalogOrder,
  createCatalogCheckoutSession,
  getCatalogLeadContext,
  getConversationById,
  getLatestActiveCatalogOrderForConversation,
  getLocationRequestedCatalogOrderForConversation,
  getOrCreateConversation,
  getRecentHistory,
  insertMessage,
  markMessageProcessed,
  markCatalogOrderPaymentProof,
  saveCatalogOrderLocation,
  setCatalogLeadContext,
  setMode,
  updateMessageWaId,
  wasMessageProcessed,
  type Conversation,
} from "@/lib/db";
import { getProductForCatalogLead } from "@/lib/catalog-storefront/server";
import { parseCatalogLeadContext } from "@/lib/catalog-storefront/whatsapp";
import { dispatchCatalogLocationRequest } from "@/lib/catalog-order-flow";
import { HUMAN_HANDOFF_REPLY } from "@/lib/handoff";
import { containsUnsafeCheckoutReply, hasSensitiveCommerceData, requestsHumanSupport, shouldSendCatalog } from "@/lib/message-routing";
import { generateAssistantReply } from "@/lib/openai";
import { sendCatalogCtaMessage, sendTextMessage } from "@/lib/meta/client";
import { parseOrderConfirmationCode } from "@/lib/order-code";
import { sendPaymentQr } from "@/lib/payment-qr";

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
  return httpsBaseUrl(process.env.PUBLIC_APP_URL || origin);
}

/**
 * Permite alojar el agente y el catálogo en dominios distintos. Si no se
 * configura, conserva el destino histórico dentro de la misma aplicación.
 */
function catalogPublicUrl(origin?: string): string | null {
  const configuredCatalogUrl = httpsBaseUrl(process.env.CATALOG_PUBLIC_URL);
  if (configuredCatalogUrl) return configuredCatalogUrl;

  const agentBaseUrl = publicBaseUrl(origin);
  return agentBaseUrl ? agentBaseUrl + "/catalogo" : null;
}

async function sendAndStore(conversation: Conversation, phone: string, content: string): Promise<void> {
  const id = insertMessage(conversation.id, "assistant", content);
  const { wa_message_id } = await sendTextMessage(phone, content);
  updateMessageWaId(id, wa_message_id);
}

/** Activa atención humana antes de avisar al cliente, para que el dashboard lo muestre de inmediato. */
async function handoffToHuman(conversation: Conversation, phone: string): Promise<void> {
  setMode(conversation.id, "HUMAN");
  await sendAndStore(conversation, phone, HUMAN_HANDOFF_REPLY);
}

/** Envía el catálogo con un identificador opaco cuando el chat ya existe. */
async function sendCatalog(
  conversation: Conversation,
  phone: string,
  origin?: string,
): Promise<void> {
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
  } catch (error) {
    // El catálogo aún puede abrirse de forma directa; el código corto vinculará
    // el pedido cuando el cliente vuelva a escribir por WhatsApp.
    console.error("[order] no se pudo crear la sesión privada del catálogo:", error);
  }

  const localId = insertMessage(conversation.id, "assistant", "Catálogo enviado.");
  try {
    const { wa_message_id } = await sendCatalogCtaMessage(phone, checkoutUrl);
    updateMessageWaId(localId, wa_message_id);
  } catch (error) {
    console.error("[wh] no se pudo enviar el catálogo:", error);
    await sendAndStore(
      conversation,
      phone,
      "No pudimos abrir el catálogo ahora. Escríbenos qué producto buscas y te ayudamos.",
    );
  }
}

async function handleTextMessage(message: RecordValue, contactName: string | null, origin?: string): Promise<void> {
  const textData = isRecord(message.text) ? message.text : undefined;
  const waMessageId = typeof message.id === "string" ? message.id : undefined;
  const phone = typeof message.from === "string" ? message.from : undefined;
  const content = typeof textData?.body === "string" ? textData.body.trim() : "";
  if (!waMessageId || !phone || !content) return;
  if (wasMessageProcessed(waMessageId) || !markMessageProcessed(waMessageId)) return;

  console.log("[wh] ← mensaje de texto recibido");
  const conversation = getOrCreateConversation(phone, contactName);
  const messageCountBefore = getRecentHistory(conversation.id, 1).length;
  insertMessage(conversation.id, "user", content, waMessageId);
  const freshConversation = getConversationById(conversation.id);
  if (!freshConversation || freshConversation.mode !== "AI") return;

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

  if (requestsHumanSupport(content)) {
    await handoffToHuman(conversation, phone);
    return;
  }

  const orderCode = parseOrderConfirmationCode(content);
  if (orderCode) {
    const claimed = claimCatalogOrder(orderCode, conversation.id);
    if (claimed.result === "claimed" && claimed.order) {
      await sendAndStore(
        conversation,
        phone,
        `✅ Pedido #${claimed.order.public_code} confirmado. Ahora comparte tu ubicación con el botón de WhatsApp para coordinar la entrega.`,
      );
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
  if (activeOrder?.status === "awaiting_chat_confirmation") {
    await sendAndStore(
      conversation,
      phone,
      `Tu pedido #${activeOrder.public_code} está listo. Envía el mensaje de confirmación que abrió el catálogo para continuar.`,
    );
    return;
  }
  if (activeOrder?.status === "awaiting_location") {
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
        "¡Hola! 👋 Bienvenido a Terra. Explora nuestro catálogo y elige el producto que buscas.",
      );
    }
    await sendCatalog(conversation, phone, origin);
    return;
  }

  try {
    const startedAt = Date.now();
    const reply = await generateAssistantReply(
      getRecentHistory(conversation.id, 20),
      getCatalogLeadContext(conversation.id),
    );
    console.log("[wh] LLM en " + (Date.now() - startedAt) + "ms");
    if (reply.requiresHuman || containsUnsafeCheckoutReply(reply.content)) {
      await sendAndStore(
        conversation,
        phone,
        "Para darte ese dato con precisión, revisa el catálogo o escribe “quiero hablar con un asesor” si prefieres atención humana.",
      );
      return;
    }
    await sendAndStore(conversation, phone, reply.content);
  } catch (error) {
    console.error("[wh] error procesando texto:", error);
    try {
      await sendAndStore(
        conversation,
        phone,
        "No pudimos consultar esa información ahora. Puedes explorar el catálogo o escribir “quiero hablar con un asesor”.",
      );
    } catch (sendError) {
      console.error("[wh] no se pudo enviar el mensaje de respaldo:", sendError);
    }
  }
}

async function handleLocationMessage(message: RecordValue, contactName: string | null): Promise<void> {
  const waMessageId = typeof message.id === "string" ? message.id : undefined;
  const phone = typeof message.from === "string" ? message.from : undefined;
  const location = isRecord(message.location) ? message.location : undefined;
  const latitude = typeof location?.latitude === "number" ? location.latitude : Number.NaN;
  const longitude = typeof location?.longitude === "number" ? location.longitude : Number.NaN;
  if (!waMessageId || !phone || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  if (wasMessageProcessed(waMessageId) || !markMessageProcessed(waMessageId)) return;

  const conversation = getOrCreateConversation(phone, contactName);
  insertMessage(conversation.id, "user", "Ubicación de entrega recibida.", waMessageId);
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
  if (!saved.saved) return;
  try {
    await sendPaymentQr(
      conversation.id,
      phone,
      `✅ Pedido #${order.public_code} listo para coordinar entrega. Escanea este código QR para realizar el pago y envía tu comprobante por este chat. El pago será revisado antes del despacho.`,
    );
  } catch (error) {
    console.error("[order] no se pudo enviar el QR de pago:", error);
    await sendAndStore(
      conversation,
      phone,
      "📍 Recibimos tu ubicación. Estamos preparando los datos de pago para este pedido.",
    );
  }
}

async function handleImageMessage(message: RecordValue, contactName: string | null): Promise<void> {
  const waMessageId = typeof message.id === "string" ? message.id : undefined;
  const phone = typeof message.from === "string" ? message.from : undefined;
  if (!waMessageId || !phone || wasMessageProcessed(waMessageId) || !markMessageProcessed(waMessageId)) return;

  const conversation = getOrCreateConversation(phone, contactName);
  insertMessage(conversation.id, "user", "Comprobante de pago recibido.", waMessageId);
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
  if (wasMessageProcessed(waMessageId) || !markMessageProcessed(waMessageId)) return;

  const conversation = getOrCreateConversation(phone, contactName);
  insertMessage(conversation.id, "user", "Interacción recibida.", waMessageId);
  const freshConversation = getConversationById(conversation.id);
  if (!freshConversation || freshConversation.mode !== "AI") return;
  await sendCatalog(conversation, phone, origin);
}

export async function processWebhookPayload(payload: unknown, origin?: string): Promise<void> {
  if (!isRecord(payload) || payload.object !== "whatsapp_business_account") return;
  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) continue;
    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || change.field !== "messages" || !isRecord(change.value)) continue;
      const value = change.value;
      for (const status of asArray(value.statuses)) {
        if (isRecord(status)) {
          console.log("[wh] status " + String(status.status ?? "unknown") + " para " + String(status.id ?? "?"));
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
          console.log("[wh] tipo no soportado: " + String(rawMessage.type ?? "unknown"));
        }
      }
    }
  }
}
