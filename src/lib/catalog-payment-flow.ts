import {
  completeCatalogPaymentQrDelivery,
  failCatalogPaymentQrDelivery,
  getConversationById,
  reserveCatalogPaymentQrDelivery,
} from "@/lib/db";
import { PaymentQrPreparationError, sendPaymentQr } from "@/lib/payment-qr";

export type CatalogPaymentQrDispatch = "sent" | "already_sent" | "in_progress" | "not_ready" | "failed" | "suppressed" | "uncertain" | "accepted_persistence_failed";

/** Envía el QR una sola vez y confirma la transición de pago solo tras éxito. */
export async function dispatchCatalogPaymentQr(orderId: string): Promise<CatalogPaymentQrDispatch> {
  const reservation = reserveCatalogPaymentQrDelivery(orderId);
  if (reservation.reservation !== "reserved") return reservation.reservation;

  const order = reservation.order;
  if (!order?.conversation_id) return "not_ready";
  const conversation = getConversationById(order.conversation_id);
  if (!conversation || conversation.mode !== "AI") {
    failCatalogPaymentQrDelivery(order.id); // No se intentó enviar a Meta.
    return conversation ? "suppressed" : "not_ready";
  }

  let sent: { waMessageId: string } | null;
  try {
    sent = await sendPaymentQr(
      conversation.id,
      conversation.phone,
      `✅ Pedido #${order.public_code} listo para coordinar entrega. Escanea este código QR para realizar el pago y envía tu comprobante por este chat. El pago será revisado antes del despacho.`,
      { requireAiMode: true },
    );
  } catch (error) {
    if (error instanceof PaymentQrPreparationError) {
      failCatalogPaymentQrDelivery(order.id);
      console.error("[order] no se pudo preparar el QR; no se intentó enviar a Meta.");
      return "failed";
    }
    // Un timeout u otra respuesta ambigua no prueba que Meta no lo aceptara.
    // Se conserva la reserva y no se provoca un segundo mensaje como fallback.
    console.error("[order] resultado del envío QR incierto; requiere revisión antes de reintentar.");
    return "uncertain";
  }

  if (!sent) {
    failCatalogPaymentQrDelivery(order.id); // Cancelado antes de llamar a Meta.
    return "suppressed";
  }

  try {
    completeCatalogPaymentQrDelivery(order.id, sent.waMessageId);
  } catch {
    // No convertir una aceptación real en failed/reintentable por un fallo local.
    console.error("[order] QR aceptado por Meta sin persistencia final; no reenviar automáticamente.");
    return "accepted_persistence_failed";
  }
  return "sent";
}
