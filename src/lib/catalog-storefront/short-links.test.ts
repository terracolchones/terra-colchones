import { describe, expect, it } from "vitest";
import { CATALOG_PUBLIC_ORIGIN, parseProductLink, publicShortLink, SHORT_CODE_PATTERN } from "./short-links";

describe("enlaces públicos de producto", () => {
  it.each([
    `${CATALOG_PUBLIC_ORIGIN}/catalogo/productos/sabana-teka`,
    "terracolchonesymuebles.online/catalogo/productos/sabana-teka/",
    "https://www.terracolchonesymuebles.online/catalogo/productos/sabana-teka?utm_source=facebook&fbclid=public-campaign",
  ])("normaliza %s", (url) => expect(parseProductLink(url)).toBe("sabana-teka"));

  it.each([
    "https://example.com/catalogo/productos/sabana-teka",
    "https://terracolchonesymuebles.online.evil.test/catalogo/productos/sabana-teka",
    "https://terracolchonesymuebles.online@evil.test/catalogo/productos/sabana-teka",
    "https://user:pass@terracolchonesymuebles.online/catalogo/productos/sabana-teka",
    "https://terracolchonesymuebles.online:3000/catalogo/productos/sabana-teka",
    `${CATALOG_PUBLIC_ORIGIN}/api/catalog/admin/products`,
    `${CATALOG_PUBLIC_ORIGIN}/catalogo`,
    `${CATALOG_PUBLIC_ORIGIN}/catalogo/productos/no-existe/otra-ruta`,
    `${CATALOG_PUBLIC_ORIGIN}/catalogo/productos/sabana-teka?checkout=private-test-context`,
    `${CATALOG_PUBLIC_ORIGIN}/catalogo/productos/sabana-teka?token=private-test-context`,
    `${CATALOG_PUBLIC_ORIGIN}/catalogo/productos/sabana-teka#fragment`,
    `${CATALOG_PUBLIC_ORIGIN}/catalogo/productos/%2Fother`,
    "javascript:alert(1)", "//example.com", "", null, {},
  ])("rechaza destinos o datos no compartibles: %j", (url) => {
    expect(() => parseProductLink(url)).toThrow();
  });

  it("produce enlaces sin IDs internos y reserva el espacio de rutas numéricas", () => {
    expect(publicShortLink("7k3", { slug: "producto-futuro", name: "Producto futuro" })).toEqual({
      code: "7k3", shortUrl: `${CATALOG_PUBLIC_ORIGIN}/7k3`,
      productUrl: `${CATALOG_PUBLIC_ORIGIN}/catalogo/productos/producto-futuro`, productName: "Producto futuro",
    });
    expect(SHORT_CODE_PATTERN.test("7k3")).toBe(true);
    for (const route of ["api", "catalogo", "privacy", "7k", "../7k3", "7k3/extra"]) expect(SHORT_CODE_PATTERN.test(route)).toBe(false);
  });
});
