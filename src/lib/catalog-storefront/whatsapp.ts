import type { CatalogLeadContext } from "@/lib/catalog-storefront/types";

// Compatibilidad de lectura para mensajes antiguos. Ningún enlace nuevo emite
// este contexto ni expone UUIDs al cliente.
const LEGACY_CONTEXT_PATTERN = /\[TERRA-CAT:([0-9a-f-]{36})(?::([0-9a-f-]{36}|base))?\]/i;
const WHATSAPP_PHONE_PATTERN = /^[1-9]\d{7,14}$/;

export function normalizeWhatsAppPhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  return WHATSAPP_PHONE_PATTERN.test(digits) ? digits : null;
}

/** El cliente solo ve un código de pedido corto; los IDs internos nunca salen del servidor. */
export function buildOrderConfirmationWhatsAppUrl(
  orderCode: string,
  phone: string | null,
): string | null {
  if (!phone || !/^T-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(orderCode)) return null;
  const message = `Hola Terra, confirmo mi pedido #${orderCode}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function parseCatalogLeadContext(content: string): CatalogLeadContext | null {
  const match = LEGACY_CONTEXT_PATTERN.exec(content);
  if (!match) return null;
  return {
    productId: match[1].toLowerCase(),
    variantId: match[2] && match[2].toLowerCase() !== "base" ? match[2].toLowerCase() : null,
  };
}
