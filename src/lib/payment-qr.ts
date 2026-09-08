import "server-only";

import { insertMessage, updateMessageWaId } from "@/lib/db";
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
  const messageId = insertMessage(conversationId, "human", LOCAL_MESSAGE, null);
  const { wa_message_id } = await sendImageMessage(phone, qr.signedUrl, caption);
  updateMessageWaId(messageId, wa_message_id);
  return { waMessageId: wa_message_id };
}
