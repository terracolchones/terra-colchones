import type { ProductAvailability } from "@/lib/catalog-storefront/types";

export const DEFAULT_NEW_PRODUCT_AVAILABILITY: ProductAvailability = "available";

const VALID_AVAILABILITIES = new Set<ProductAvailability>([
  "available",
  "out_of_stock",
  "coming_soon",
]);

export function isProductAvailability(value: unknown): value is ProductAvailability {
  return typeof value === "string" && VALID_AVAILABILITIES.has(value as ProductAvailability);
}
