import "server-only";

import { getConversationById, insertMessage } from "@/lib/db";
import { sendImageMessage } from "@/lib/meta/client";
import { getPaymentQrSignedUrl } from "@/lib/supabase-qr";

const PAYMENT_CAPTION = "✅ Pedido listo para coordinar entrega. Escanea este código QR para realizar el pago y envía tu comprobante por este chat. Un asesor validará el pago y se comunicará contigo. Gracias por tu compra.";
const LOCAL_MESSAGE = "QR de pago enviado.";

/** Solo representa un fallo anterior a cualquier intento de envío a Meta. */
export class PaymentQrPreparationError extends Error {
  constructor() {
    // No conservar mensajes/cause de Storage: pueden incluir URLs firmadas.
    super("No se pudo preparar el QR de pago");
    this.name = "PaymentQrPreparationError";
  }
}

export function sendPaymentQr(
  conversationId: number,
  phone: string,
  caption: string | undefined,
  options: { requireAiMode: true },
): Promise<{ waMessageId: string } | null>;
export function sendPaymentQr(
  conversationId: number,
  phone: string,
  caption?: string,
  options?: { requireAiMode?: false },
): Promise<{ waMessageId: string }>;
export async function sendPaymentQr(
  conversationId: number,
  phone: string,
  caption = PAYMENT_CAPTION,
  options: { requireAiMode?: boolean } = {},
): Promise<{ waMessageId: string } | null> {
  let qr: Awaited<ReturnType<typeof getPaymentQrSignedUrl>>;
  try {
    if (options.requireAiMode && getConversationById(conversationId)?.mode !== "AI") return null;
    qr = await getPaymentQrSignedUrl();
    // El operador puede tomar el chat mientras se obtiene la URL firmada.
    // El envío manual del panel conserva su autorización explícita en HUMAN.
    if (options.requireAiMode && getConversationById(conversationId)?.mode !== "AI") return null;
  } catch {
    throw new PaymentQrPreparationError();
  }
  const { wa_message_id } = await sendImageMessage(phone, qr.signedUrl, caption);
  // El registro local solo se crea tras la aceptación de Meta; de esta forma un
  // fallo de almacenamiento o Graph nunca aparenta que el QR fue entregado.
  try {
    insertMessage(conversationId, "assistant", LOCAL_MESSAGE, wa_message_id);
  } catch {
    // Meta ya aceptó el QR. No debemos reintentar ni duplicar el cobro por un
    // fallo secundario al guardar el historial local.
    console.error("[order] QR aceptado por Meta, pero no se pudo guardar el historial; no reenviar automáticamente.");
  }
  return { waMessageId: wa_message_id };
}
