import type { CatalogProduct, CatalogVariant, ProductAvailability } from "./types";

/** Las versiones tienen stock propio; la familia se usa cuando no hay versión. */
export function purchaseAvailability(
  product: Pick<CatalogProduct, "availability">,
  variant: Pick<CatalogVariant, "availability"> | null,
): ProductAvailability {
  return variant?.availability ?? product.availability;
}

export function purchaseUnavailableMessage(availability: ProductAvailability): string | null {
  if (availability === "coming_soon") {
    return "Próximamente. Podrás confirmar tu pedido cuando esté disponible.";
  }
  if (availability === "out_of_stock") {
    return "Agotado por el momento. Elige otra opción disponible.";
  }
  return null;
}
