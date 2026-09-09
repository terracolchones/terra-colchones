import {
  completeCatalogPaymentQrDelivery,
  failCatalogPaymentQrDelivery,
  getConversationById,
  reserveCatalogPaymentQrDelivery,
} from "@/lib/db";
import { sendPaymentQr } from "@/lib/payment-qr";

export type CatalogPaymentQrDispatch = "sent" | "already_sent" | "in_progress" | "not_ready" | "failed";

/** Envía el QR una sola vez y confirma la transición de pago solo tras éxito. */
export async function dispatchCatalogPaymentQr(orderId: string): Promise<CatalogPaymentQrDispatch> {
  const reservation = reserveCatalogPaymentQrDelivery(orderId);
  if (reservation.reservation !== "reserved") return reservation.reservation;

  const order = reservation.order;
  if (!order?.conversation_id) return "not_ready";
  const conversation = getConversationById(order.conversation_id);
  if (!conversation) return "not_ready";

  try {
    const sent = await sendPaymentQr(
      conversation.id,
      conversation.phone,
      `✅ Pedido #${order.public_code} listo para coordinar entrega. Escanea este código QR para realizar el pago y envía tu comprobante por este chat. El pago será revisado antes del despacho.`,
    );
    completeCatalogPaymentQrDelivery(order.id, sent.waMessageId);
    return "sent";
  } catch (error) {
    failCatalogPaymentQrDelivery(order.id);
    console.error("[order] no se pudo enviar el QR de pago:", error);
    return "failed";
  }
}
