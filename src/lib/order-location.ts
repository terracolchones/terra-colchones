import {
  completeLocationRequestDelivery,
  failLocationRequestDelivery,
  getConversationById,
  getOrderById,
  insertMessage,
  reserveLocationRequestDelivery,
} from "@/lib/db";
import { sendLocationRequestMessage } from "@/lib/meta/client";

export type LocationRequestDispatchResult =
  | { status: "sent" }
  | { status: "already_sent" }
  | { status: "in_progress" }
  | { status: "not_found" }
  | { status: "not_ready" }
  | { status: "failed" };

/**
 * Emite la solicitud GPS nativa en la conversación ligada al pedido.
 * Lo pueden usar tanto la landing heredada como los botones nativos de WhatsApp.
 */
export async function dispatchOrderLocationRequest(orderId: string): Promise<LocationRequestDispatchResult> {
  const existingOrder = getOrderById(orderId);
  if (!existingOrder) return { status: "not_found" };
  if (existingOrder.status !== "awaiting_location") return { status: "not_ready" };

  const reservation = reserveLocationRequestDelivery(orderId);
  if (reservation.reservation === "not_ready" || !reservation.order) return { status: "not_ready" };
  if (reservation.reservation === "already_sent") return { status: "already_sent" };
  if (reservation.reservation === "in_progress") return { status: "in_progress" };

  const conversation = getConversationById(reservation.order.conversation_id);
  if (!conversation) {
    failLocationRequestDelivery(orderId);
    return { status: "failed" };
  }

  try {
    const sent = await sendLocationRequestMessage(conversation.phone, reservation.order.product_name);
    completeLocationRequestDelivery(orderId, sent.wa_message_id);
    try {
      insertMessage(conversation.id, "assistant", "Solicitud de ubicación enviada.", sent.wa_message_id);
    } catch (error) {
      // El mensaje ya fue aceptado por Meta; no se vuelve a enviar por un fallo de auditoría local.
      console.error("[order] no se pudo registrar la solicitud de ubicación:", error);
    }
    return { status: "sent" };
  } catch (error) {
    failLocationRequestDelivery(orderId);
    console.error("[order] no se pudo enviar la solicitud nativa de ubicación:", error);
    return { status: "failed" };
  }
}
