import { describe, expect, it } from "vitest";
import type { CatalogProduct, CatalogVariant } from "./types";
import { buildCatalogWhatsAppUrl } from "./whatsapp";

const product: CatalogProduct = {
  id: "fcb372be-84b9-4bc3-b6df-a7f1787055e8",
  externalCode: null,
  slug: "colchon-terra",
  name: "Colchón Terra Confort",
  category: "Colchones",
  shortDescription: "",
  description: "",
  specifications: ["2 plazas", "Color gris", "Resorte reforzado"],
  priceFrom: null,
  compareAtPriceFrom: null,
  availability: "available",
  published: true,
  featured: false,
  sortOrder: 0,
  images: [],
  variants: [],
};

const variant: CatalogVariant = {
  id: "1e91f20a-f6ee-4ff4-bb5a-e2f7d7a28d4e",
  externalCode: null,
  label: "2 plazas · Gris",
  price: null,
  compareAtPrice: null,
  availability: "available",
  active: true,
  sortOrder: 0,
};

describe("enlace de pedido por WhatsApp", () => {
  it("envía únicamente los datos relevantes del producto seleccionado", () => {
    const url = buildCatalogWhatsAppUrl(product, variant, "59170000000");
    const message = new URL(url ?? "").searchParams.get("text");

    expect(message).toContain("Producto: Colchón Terra Confort");
    expect(message).toContain("Opción seleccionada: 2 plazas · Gris");
    expect(message).toContain("- Color gris");
    expect(message).toContain("- Resorte reforzado");
    expect(message).not.toContain("Hola Terra");
  });
});
