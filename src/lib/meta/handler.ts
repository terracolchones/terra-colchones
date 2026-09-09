import {
  getCatalogLeadContext,
  getConversationById,
  getOrCreateConversation,
  getRecentHistory,
  insertMessage,
  markMessageProcessed,
  setCatalogLeadContext,
  setMode,
  updateMessageWaId,
  wasMessageProcessed,
  type Conversation,
} from "@/lib/db";
import { getProductForCatalogLead } from "@/lib/catalog-storefront/server";
import { parseCatalogLeadContext } from "@/lib/catalog-storefront/whatsapp";
import { HUMAN_HANDOFF_REPLY } from "@/lib/handoff";
import { containsUnsafeCheckoutReply, hasSensitiveCommerceData, requestsHumanSupport, shouldSendCatalog } from "@/lib/message-routing";
import { generateAssistantReply } from "@/lib/openai";
import { sendCatalogCtaMessage, sendTextMessage } from "@/lib/meta/client";

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

/** Envía siempre al catálogo nuevo; no crea pedidos ni URLs de checkout heredadas. */
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

  const localId = insertMessage(conversation.id, "assistant", "Catálogo enviado.");
  try {
    const { wa_message_id } = await sendCatalogCtaMessage(phone, catalogUrl);
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

  if (requestsHumanSupport(content) || hasSensitiveCommerceData(content)) {
    await handoffToHuman(conversation, phone);
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
      await handoffToHuman(conversation, phone);
      return;
    }
    await sendAndStore(conversation, phone, reply.content);
  } catch (error) {
    console.error("[wh] error procesando texto:", error);
    try {
      await handoffToHuman(conversation, phone);
    } catch (sendError) {
      console.error("[wh] no se pudo enviar el mensaje de respaldo:", sendError);
    }
  }
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
        } else {
          console.log("[wh] tipo no soportado: " + String(rawMessage.type ?? "unknown"));
        }
      }
    }
  }
}
