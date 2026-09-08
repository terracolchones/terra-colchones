import type { CatalogLeadContext, CatalogProduct, CatalogVariant } from "@/lib/catalog-storefront/types";

const CONTEXT_PATTERN = /\[TERRA-CAT:([0-9a-f-]{36})(?::([0-9a-f-]{36}|base))?\]/i;
const WHATSAPP_PHONE_PATTERN = /^[1-9]\d{7,14}$/;

export function normalizeWhatsAppPhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  return WHATSAPP_PHONE_PATTERN.test(digits) ? digits : null;
}

export function buildCatalogWhatsAppUrl(
  product: CatalogProduct,
  variant: CatalogVariant | null,
  phone: string | null,
): string | null {
  if (!phone) return null;
  const variantLine = variant ? ` Variante: ${variant.label}.` : "";
  const variantContext = variant?.id ?? "base";
  const message = `Hola Terra, quiero consultar ${product.name}.${variantLine} [TERRA-CAT:${product.id}:${variantContext}]`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function parseCatalogLeadContext(content: string): CatalogLeadContext | null {
  const match = CONTEXT_PATTERN.exec(content);
  if (!match) return null;

  return {
    productId: match[1].toLowerCase(),
    variantId: match[2] && match[2].toLowerCase() !== "base" ? match[2].toLowerCase() : null,
  };
}
