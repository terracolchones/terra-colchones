export const LOUNGE_PRODUCT = {
  slug: "sillon-lounge",
  name: "Sillón Giratorio Lounge Confort",
  colors: ["Amarillo", "Gris", "Azul"],
} as const;

export type LoungeColor = (typeof LOUNGE_PRODUCT.colors)[number];

export function isLoungeColor(value: unknown): value is LoungeColor {
  return typeof value === "string" && LOUNGE_PRODUCT.colors.includes(value as LoungeColor);
}
