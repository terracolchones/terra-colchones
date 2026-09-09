import {
  completeCatalogLocationRequest,
  failCatalogLocationRequest,
  getConversationById,
  reserveCatalogLocationRequest,
} from "@/lib/db";
import { sendLocationRequestMessage } from "@/lib/meta/client";

/** Envía una sola vez la solicitud GPS nativa una vez confirmado el pedido. */
export async function dispatchCatalogLocationRequest(orderId: string): Promise<"sent" | "already_sent" | "in_progress" | "not_ready" | "failed"> {
  const reservation = reserveCatalogLocationRequest(orderId);
  if (reservation.reservation !== "reserved") return reservation.reservation;
  const order = reservation.order;
  if (!order?.conversation_id) return "not_ready";
  const conversation = getConversationById(order.conversation_id);
  if (!conversation) return "not_ready";

  try {
    const sent = await sendLocationRequestMessage(conversation.phone, order.product_name);
    completeCatalogLocationRequest(order.id, sent.wa_message_id);
    return "sent";
  } catch (error) {
    failCatalogLocationRequest(order.id);
    console.error("[order] no se pudo enviar la solicitud GPS:", error);
    return "failed";
  }
}
