import { normalizeWhatsAppPhone } from "./whatsapp";

/** El destino comercial se configura en el catálogo; Meta pertenece al agente. */
export async function getCatalogWhatsAppPhone(): Promise<string | null> {
  return normalizeWhatsAppPhone(process.env.TERRA_WHATSAPP_PHONE)
    ?? normalizeWhatsAppPhone(process.env.NEXT_PUBLIC_TERRA_WHATSAPP_PHONE);
}
