import {
  createDraftOrder,
  confirmOrderFromLanding,
  getConversationById,
  getLatestLocationRequestedOrderForConversation,
  getLatestOrderForConversation,
  getOrCreateConversation,
  getOrderForConversation,
  getRecentHistory,
  insertMessage,
  markMessageProcessed,
  markOrderPaymentProof,
  saveOrderLocation,
  selectOrderColor,
  updateMessageWaId,
  wasMessageProcessed,
  type Conversation,
  type Order,
} from "@/lib/db";
import { isLoungeColor, LOUNGE_PRODUCT } from "@/lib/catalog";
import { generateAssistantReply } from "@/lib/openai";
import {
  sendColorSelectorMessage,
  sendLandingCtaMessage,
  sendOrderConfirmationMessage,
  sendTextMessage,
} from "@/lib/meta/client";
import { dispatchOrderLocationRequest } from "@/lib/order-location";
import { sendPaymentQr } from "@/lib/payment-qr";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function publicBaseUrl(origin?: string): string | null {
  const candidate = (process.env.PUBLIC_APP_URL || origin || "").replace(/\/$/, "");
  return candidate.startsWith("https://") ? candidate : null;
}

function isProductIntent(content: string): boolean {
  return /\b(ver|quiero|deseo|hacer|realizar)?\s*(producto|oferta|pedido|comprar|compra)\b/i.test(content);
}

function isCampaignGreeting(content: string): boolean {
  return /^(hola|holi|buenas|buenos d[ií]as|buenas tardes|buenas noches)[!.\s]*$/i.test(content.trim());
}

/** Una confirmación escrita nunca equivale al toque del botón nativo de confirmación. */
function isConfirmationIntent(content: string): boolean {
  return /^(confirmar|confirmo|confirmación|si|sí|continuar|listo|quiero confirmar)(?:[!.\s]|$)/i.test(content.trim());
}

/** Comando de prueba para empezar un pedido limpio sin tocar el anterior. */
function isRestartDemoIntent(content: string): boolean {
  return /^(nueva demo|nueva demostraci[oó]n|reiniciar(?: demo)?|empezar de nuevo|probar (?:de nuevo|otra vez)|ver producto otra vez|nuevo pedido)$/i.test(content.trim());
}

/** Incluye saludos con errores cortos, por ejemplo “Holq”, sin depender de la IA. */
function isShortCampaignMessage(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.length > 0
    && trimmed.length <= 32
    && /^[\p{L}\p{N}\s¡!¿?.,-]+$/u.test(trimmed);
}

/** La IA no puede adelantar pasos que son exclusivos del flujo de compra. */
function mentionsControlledPurchaseStep(content: string): boolean {
  return /\b(gps|ubicaci[oó]n|pago|transferencia|comprobante|qr)\b|c[oó]digo\s+qr/i.test(content);
}

async function sendAndStore(conversation: Conversation, phone: string, content: string): Promise<void> {
  const id = insertMessage(conversation.id, "assistant", content);
  const { wa_message_id } = await sendTextMessage(phone, content);
  updateMessageWaId(id, wa_message_id);
}

function productImageUrl(color: string, origin?: string): string | undefined {
  const baseUrl = publicBaseUrl(origin);
  if (!baseUrl) return undefined;
  return `${baseUrl}/productos/sillon-lounge-${color.toLocaleLowerCase("es")}.jpg`;
}

/**
 * Inicio del flujo de compra: abre la landing con un id de pedido ya vinculado
 * al chat. La landing confirma el color y, al volver al chat, pide el GPS.
 */
async function sendProductLanding(
  conversation: Conversation,
  phone: string,
  origin?: string,
  options?: { forceNew?: boolean; order?: Order },
): Promise<void> {
  const order = options?.order
    ?? (options?.forceNew
      ? createDraftOrder(conversation.id, LOUNGE_PRODUCT)
      : getLatestOrderForConversation(conversation.id, ["draft"])
        ?? createDraftOrder(conversation.id, LOUNGE_PRODUCT));
  const baseUrl = publicBaseUrl(origin);

  if (!baseUrl) {
    await sendAndStore(
      conversation,
      phone,
      "No pudimos abrir la oferta porque falta configurar la URL pública segura de Terra.",
    );
    return;
  }

  const landingUrl = `${baseUrl}/landing.html?order=${encodeURIComponent(order.id)}`;
  const localId = insertMessage(conversation.id, "assistant", `Oferta enviada: ${LOUNGE_PRODUCT.name}.`);
  try {
    const { wa_message_id } = await sendLandingCtaMessage(phone, landingUrl, LOUNGE_PRODUCT.name);
    updateMessageWaId(localId, wa_message_id);
  } catch (error) {
    console.error("[wh] no se pudo enviar la landing:", error);
    await sendAndStore(conversation, phone, "No pudimos abrir la oferta. Escribe “Nueva demo” para intentarlo nuevamente.");
  }
}

/** Compatibilidad con selectores nativos que ya pudieron haberse enviado. */
async function sendNativeProductSelector(
  conversation: Conversation,
  phone: string,
  origin?: string,
  options?: { forceNew?: boolean; order?: Order },
): Promise<void> {
  const order = options?.order
    ?? (options?.forceNew
      ? createDraftOrder(conversation.id, LOUNGE_PRODUCT)
      : getLatestOrderForConversation(conversation.id, ["draft"])
        ?? createDraftOrder(conversation.id, LOUNGE_PRODUCT));
  const color = order.color && isLoungeColor(order.color) ? order.color : "Amarillo";
  const localId = insertMessage(conversation.id, "assistant", `Selector de color enviado: ${LOUNGE_PRODUCT.name}.`);
  try {
    const { wa_message_id } = await sendColorSelectorMessage(phone, order.id, productImageUrl(color, origin));
    updateMessageWaId(localId, wa_message_id);
  } catch (error) {
    console.error("[wh] no se pudo enviar selector nativo:", error);
    await sendAndStore(conversation, phone, "No pudimos abrir el selector. Escribe “Nueva demo” para intentarlo nuevamente.");
  }
}

async function sendNativeOrderConfirmation(
  conversation: Conversation,
  phone: string,
  order: Order,
  origin?: string,
): Promise<void> {
  if (!order.color || !isLoungeColor(order.color)) {
    await sendNativeProductSelector(conversation, phone, origin, { order });
    return;
  }
  const localId = insertMessage(conversation.id, "assistant", `Color ${order.color} elegido. Pendiente de confirmación.`);
  try {
    const { wa_message_id } = await sendOrderConfirmationMessage(
      phone,
      order.id,
      order.color,
      productImageUrl(order.color, origin),
    );
    updateMessageWaId(localId, wa_message_id);
  } catch (error) {
    console.error("[wh] no se pudo enviar confirmación nativa:", error);
    await sendAndStore(conversation, phone, "No pudimos mostrar la confirmación. Escribe “Nueva demo” para volver a intentarlo.");
  }
}

type NativeButtonAction =
  | { kind: "color"; orderId: string; color: string }
  | { kind: "confirm"; orderId: string }
  | { kind: "colors"; orderId: string };

function nativeButtonAction(value: string): NativeButtonAction | null {
  const colorMatch = /^color:(TERRA-[A-Z0-9]{12}):(Amarillo|Gris|Azul)$/i.exec(value);
  if (colorMatch) {
    const color = LOUNGE_PRODUCT.colors.find((candidate) => candidate.toLowerCase() === colorMatch[2].toLowerCase());
    if (color) return { kind: "color", orderId: colorMatch[1].toUpperCase(), color };
  }
  const confirmMatch = /^confirm:(TERRA-[A-Z0-9]{12})$/i.exec(value);
  if (confirmMatch) return { kind: "confirm", orderId: confirmMatch[1].toUpperCase() };
  const colorsMatch = /^colors:(TERRA-[A-Z0-9]{12})$/i.exec(value);
  if (colorsMatch) return { kind: "colors", orderId: colorsMatch[1].toUpperCase() };
  return null;
}

async function handleInteractiveMessage(message: RecordValue, contactName: string | null, origin?: string): Promise<void> {
  const waMessageId = typeof message.id === "string" ? message.id : undefined;
  const phone = typeof message.from === "string" ? message.from : undefined;
  const interactive = isRecord(message.interactive) ? message.interactive : undefined;
  const buttonReply = isRecord(interactive?.button_reply) ? interactive.button_reply : undefined;
  const actionId = typeof buttonReply?.id === "string" ? buttonReply.id : "";
  const action = nativeButtonAction(actionId);
  if (!waMessageId || !phone || !action) return;
  if (wasMessageProcessed(waMessageId) || !markMessageProcessed(waMessageId)) return;

  const conversation = getOrCreateConversation(phone, contactName);
  const label = typeof buttonReply?.title === "string" ? buttonReply.title : "Selección de pedido";
  insertMessage(conversation.id, "user", label, waMessageId);
  const currentConversation = getConversationById(conversation.id);
  if (!currentConversation || currentConversation.mode !== "AI") return;

  if (action.kind === "color") {
    const order = selectOrderColor(action.orderId, conversation.id, action.color);
    if (!order) {
      await sendNativeProductSelector(conversation, phone, origin, { forceNew: true });
      return;
    }
    await sendNativeOrderConfirmation(conversation, phone, order, origin);
    return;
  }

  if (action.kind === "colors") {
    const order = getOrderForConversation(action.orderId, conversation.id);
    if (!order || order.status !== "draft") {
      await sendNativeProductSelector(conversation, phone, origin, { forceNew: true });
      return;
    }
    await sendNativeProductSelector(conversation, phone, origin, { order });
    return;
  }

  const beforeConfirmation = getOrderForConversation(action.orderId, conversation.id);
  if (!beforeConfirmation || !beforeConfirmation.color || !isLoungeColor(beforeConfirmation.color)) {
    await sendNativeProductSelector(conversation, phone, origin, { forceNew: true });
    return;
  }
  const order = confirmOrderFromLanding(action.orderId, beforeConfirmation.color);
  if (!order || order.status !== "awaiting_location") {
    await sendAndStore(conversation, phone, "No pudimos confirmar este pedido. Escribe “Nueva demo” para intentarlo nuevamente.");
    return;
  }

  const result = await dispatchOrderLocationRequest(order.id);
  if (result.status === "failed") {
    await sendAndStore(conversation, phone, "No pudimos enviar el botón de ubicación. Escribe “Nueva demo” para volver a intentarlo.");
  }
}

async function handleTextMessage(message: RecordValue, contactName: string | null, origin?: string): Promise<void> {
  const textData = isRecord(message.text) ? message.text : undefined;
  const waMessageId = typeof message.id === "string" ? message.id : undefined;
  const phone = typeof message.from === "string" ? message.from : undefined;
  const content = typeof textData?.body === "string" ? textData.body.trim() : "";
  if (!waMessageId || !phone || !content) return;
  if (wasMessageProcessed(waMessageId) || !markMessageProcessed(waMessageId)) return;

  console.log(`[wh] ← texto de ${phone}: ${JSON.stringify(content)}`);
  const conversation = getOrCreateConversation(phone, contactName);
  const messageCountBefore = getRecentHistory(conversation.id, 1).length;
  insertMessage(conversation.id, "user", content, waMessageId);
  const freshConversation = getConversationById(conversation.id);
  if (!freshConversation || freshConversation.mode !== "AI") return;

  if (isRestartDemoIntent(content)) {
    await sendProductLanding(conversation, phone, origin, { forceNew: true });
    return;
  }

  // Un chat de campaña con un pedido activo nunca cae al modelo. Así “Confirmar”,
  // un typo o cualquier texto no puede saltar los botones ni solicitar GPS antes.
  const activeOrder = getLatestOrderForConversation(conversation.id, [
    "draft",
    "awaiting_location",
    "awaiting_payment",
    "payment_proof_received",
  ]);
  if (activeOrder?.status === "awaiting_payment") {
    await sendAndStore(
      conversation,
      phone,
      "✅ Ya recibimos tu ubicación. Envía tu comprobante de pago por este chat para continuar con el despacho.",
    );
    return;
  }
  if (activeOrder?.status === "payment_proof_received") {
    await sendAndStore(
      conversation,
      phone,
      "✅ Tu comprobante está en revisión. Un asesor te confirmará el despacho por este chat.",
    );
    return;
  }
  if (activeOrder?.status === "awaiting_location" && activeOrder.location_requested === 1) {
    await sendAndStore(
      conversation,
      phone,
      "📍 Comparte tu ubicación con el botón de arriba para continuar.",
    );
    return;
  }
  if (activeOrder?.status === "draft") {
    await sendProductLanding(conversation, phone, origin, { order: activeOrder });
    return;
  }
  if (activeOrder?.status === "awaiting_location") {
    await sendAndStore(
      conversation,
      phone,
      "📍 Tu pedido ya está confirmado. Vuelve a la landing y pulsa “Volver al chat” para recibir el botón de ubicación en este chat.",
    );
    return;
  }
  if (messageCountBefore === 0) {
    await sendAndStore(
      conversation,
      phone,
      "¡Hola! 👋 Vimos que te interesó nuestro Sillón Giratorio Lounge Confort. Elige tu color para comenzar.",
    );
    await sendProductLanding(conversation, phone, origin);
    return;
  }
  if (
    isProductIntent(content)
    || isCampaignGreeting(content)
    || isConfirmationIntent(content)
    || isShortCampaignMessage(content)
  ) {
    await sendProductLanding(conversation, phone, origin);
    return;
  }

  try {
    const startedAt = Date.now();
    const reply = await generateAssistantReply(getRecentHistory(conversation.id, 20));
    console.log(`[wh] LLM en ${Date.now() - startedAt}ms`);
    if (mentionsControlledPurchaseStep(reply)) {
      await sendProductLanding(conversation, phone, origin);
      return;
    }
    await sendAndStore(conversation, phone, reply);
  } catch (error) {
    console.error("[wh] error procesando texto:", error);
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
  const order = getLatestLocationRequestedOrderForConversation(conversation.id);
  if (!order) {
    const pendingOrder = getLatestOrderForConversation(conversation.id, ["awaiting_location"]);
    await sendAndStore(
      conversation,
      phone,
      pendingOrder
        ? "Primero confirma tu pedido con los botones de Terra; después te enviaremos el botón de ubicación a este chat."
        : "Recibimos tu ubicación. Primero confirma un producto para preparar el pedido.",
    );
    return;
  }

  const savedLocation = saveOrderLocation(order.id, {
    latitude,
    longitude,
    name: typeof location?.name === "string" ? location.name : null,
    address: typeof location?.address === "string" ? location.address : null,
  });
  if (!savedLocation.saved) return;
  try {
    await sendPaymentQr(
      conversation.id,
      phone,
      `✅ Pedido ${order.id} listo para coordinar entrega. Escanea este código QR para realizar el pago y envía tu comprobante por este chat. Un asesor lo validará antes del despacho.`,
    );
  } catch (error) {
    console.error("[wh] no se pudo enviar QR:", error);
    await sendAndStore(
      conversation,
      phone,
      "📍 Ubicación recibida. Tu pedido está listo para coordinar entrega; un asesor te enviará los datos de pago enseguida.",
    );
  }
}

async function handleImageMessage(message: RecordValue, contactName: string | null): Promise<void> {
  const waMessageId = typeof message.id === "string" ? message.id : undefined;
  const phone = typeof message.from === "string" ? message.from : undefined;
  if (!waMessageId || !phone || !markMessageProcessed(waMessageId)) return;

  const conversation = getOrCreateConversation(phone, contactName);
  insertMessage(conversation.id, "user", "Comprobante de pago recibido.", waMessageId);
  const order = getLatestOrderForConversation(conversation.id, ["awaiting_payment"]);
  if (!order) return;
  markOrderPaymentProof(order.id);
  await sendAndStore(
    conversation,
    phone,
    `✅ Recibimos tu comprobante del pedido ${order.id}. Un asesor validará el pago y te confirmará el despacho.`,
  );
}

export async function processWebhookPayload(payload: unknown, origin?: string): Promise<void> {
  if (!isRecord(payload) || payload.object !== "whatsapp_business_account") return;
  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) continue;
    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || change.field !== "messages" || !isRecord(change.value)) continue;
      const value = change.value;
      for (const status of asArray(value.statuses)) {
        if (isRecord(status)) console.log(`[wh] status ${String(status.status ?? "unknown")} para ${String(status.id ?? "?")}`);
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
        if (rawMessage.type === "text") await handleTextMessage(rawMessage, name, origin);
        else if (rawMessage.type === "interactive") await handleInteractiveMessage(rawMessage, name, origin);
        else if (rawMessage.type === "location") await handleLocationMessage(rawMessage, name);
        else if (rawMessage.type === "image") await handleImageMessage(rawMessage, name);
        else console.log(`[wh] tipo no soportado: ${String(rawMessage.type ?? "unknown")}`);
      }
    }
  }
}
