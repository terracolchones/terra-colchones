import "server-only";

import { insertMessage } from "@/lib/db";
import { sendImageMessage } from "@/lib/meta/client";
import { getPaymentQrSignedUrl } from "@/lib/supabase-qr";

const PAYMENT_CAPTION = "✅ Pedido listo para coordinar entrega. Escanea este código QR para realizar el pago y envía tu comprobante por este chat. Un asesor validará el pago y se comunicará contigo. Gracias por tu compra.";
const LOCAL_MESSAGE = "QR de pago enviado.";

export async function sendPaymentQr(
  conversationId: number,
  phone: string,
  caption = PAYMENT_CAPTION,
): Promise<{ waMessageId: string }> {
  const qr = await getPaymentQrSignedUrl();
  const { wa_message_id } = await sendImageMessage(phone, qr.signedUrl, caption);
  // El registro local solo se crea tras la aceptación de Meta; de esta forma un
  // fallo de almacenamiento o Graph nunca aparenta que el QR fue entregado.
  try {
    insertMessage(conversationId, "assistant", LOCAL_MESSAGE, wa_message_id);
  } catch (error) {
    // Meta ya aceptó el QR. No debemos reintentar ni duplicar el cobro por un
    // fallo secundario al guardar el historial local.
    console.error("[order] QR enviado, pero no se pudo guardar el historial:", error);
  }
  return { waMessageId: wa_message_id };
}
