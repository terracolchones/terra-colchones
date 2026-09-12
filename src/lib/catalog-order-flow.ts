import {
  completeCatalogLocationRequest,
  failCatalogLocationRequest,
  getConversationById,
  reserveCatalogLocationRequest,
} from "@/lib/db";
import { sendLocationRequestMessage } from "@/lib/meta/client";

/** Envía una sola vez la solicitud GPS nativa una vez confirmado el pedido. */
export async function dispatchCatalogLocationRequest(orderId: string): Promise<"sent" | "already_sent" | "in_progress" | "not_ready" | "failed" | "suppressed" | "uncertain" | "accepted_persistence_failed"> {
  const reservation = reserveCatalogLocationRequest(orderId);
  if (reservation.reservation !== "reserved") return reservation.reservation;
  const order = reservation.order;
  if (!order?.conversation_id) return "not_ready";
  const conversation = getConversationById(order.conversation_id);
  if (!conversation || conversation.mode !== "AI") {
    failCatalogLocationRequest(order.id); // No se intentó enviar a Meta.
    return conversation ? "suppressed" : "not_ready";
  }

  let sent: { wa_message_id: string };
  try {
    sent = await sendLocationRequestMessage(conversation.phone, order.product_name);
  } catch {
    console.error("[order] resultado del envío GPS incierto; requiere revisión antes de reintentar.");
    return "uncertain";
  }

  try {
    completeCatalogLocationRequest(order.id, sent.wa_message_id);
  } catch {
    console.error("[order] GPS aceptado por Meta sin persistencia final; no reenviar automáticamente.");
    return "accepted_persistence_failed";
  }
  return "sent";
}
