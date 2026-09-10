import type { CatalogOrder } from "@/lib/db";

/** El RAG responde la duda, pero la venta nunca pierde su siguiente paso. */
export function saleFlowResume(order: Pick<CatalogOrder, "public_code" | "status" | "location_requested" | "latitude" | "longitude">): string {
  if (order.status === "awaiting_chat_confirmation") {
    return `Para continuar con el pedido #${order.public_code}, envía el mensaje de confirmación que abrió el catálogo.`;
  }
  if (order.status === "awaiting_location") {
    if (order.latitude !== null && order.longitude !== null) {
      return "Tu ubicación ya está registrada; el siguiente paso es recibir el QR de pago por este chat.";
    }
    return order.location_requested === 1
      ? "Para continuar con el pedido, comparte tu ubicación con el botón de WhatsApp."
      : "Tu pedido sigue registrado; estamos preparando la solicitud de ubicación.";
  }
  if (order.status === "awaiting_payment") {
    return "Para continuar con el pedido, envía la imagen de tu comprobante por este chat.";
  }
  if (order.status === "payment_proof_received") {
    return "Tu comprobante sigue en revisión; el pago no se aprueba automáticamente.";
  }
  return "";
}
