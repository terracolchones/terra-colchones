import type { CatalogLeadContext, CatalogProduct, CatalogVariant } from "@/lib/catalog-storefront/types";

const DEFAULT_TERRA_PHONE = "59178600064";
const CONTEXT_PATTERN = /\[TERRA-CAT:([0-9a-f-]{36})(?::([0-9a-f-]{36}|base))?\]/i;

function phoneNumber(): string {
  const configured = process.env.NEXT_PUBLIC_TERRA_WHATSAPP_PHONE?.replace(/\D/g, "");
  return configured && /^\d{8,15}$/.test(configured) ? configured : DEFAULT_TERRA_PHONE;
}

export function buildCatalogWhatsAppUrl(product: CatalogProduct, variant: CatalogVariant | null): string {
  const variantLine = variant ? ` Variante: ${variant.label}.` : "";
  const variantContext = variant?.id ?? "base";
  const message = `Hola Terra, quiero consultar ${product.name}.${variantLine} [TERRA-CAT:${product.id}:${variantContext}]`;
  return `https://wa.me/${phoneNumber()}?text=${encodeURIComponent(message)}`;
}

export function parseCatalogLeadContext(content: string): CatalogLeadContext | null {
  const match = CONTEXT_PATTERN.exec(content);
  if (!match) return null;

  return {
    productId: match[1].toLowerCase(),
    variantId: match[2] && match[2].toLowerCase() !== "base" ? match[2].toLowerCase() : null,
  };
}
