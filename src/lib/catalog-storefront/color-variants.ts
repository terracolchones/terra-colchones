import type { CatalogVariant } from "@/lib/catalog-storefront/types";

const COLOR_HEX_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * Los colores se guardan como una variante cuyo `label` es un código hexadecimal.
 * Conserva el esquema de catálogo existente, pero permite mostrarlos aparte de
 * medidas y otras opciones comerciales.
 */
export function colorVariantHex(value: string): string | null {
  const normalized = value.trim();
  return COLOR_HEX_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

export function isColorVariant(variant: Pick<CatalogVariant, "label">): boolean {
  return colorVariantHex(variant.label) !== null;
}
