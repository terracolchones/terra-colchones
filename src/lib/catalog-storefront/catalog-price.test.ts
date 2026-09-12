import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retrieveApprovedSources } from "@/lib/rag/core";
import { requiresHumanHandoffForQuery } from "@/lib/rag/policy";
import type { CatalogProduct } from "./types";

const fixture = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  createClient: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), in: vi.fn(),
  maybeSingle: vi.fn(), getPhoneNumberInfo: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: fixture.createClient }));
vi.mock("@/lib/meta/client", () => ({ getPhoneNumberInfo: fixture.getPhoneNumberInfo }));

function productRow(productPrice: unknown, variantPrice: unknown = productPrice) {
  return {
    id: "synthetic-price-product", slug: "synthetic-price-product", name: "Colchón de prueba de precio",
    category: "Colchones", short_description: "Ficha ficticia para verificar la evidencia de precio.",
    description: "Producto sintético, sin datos comerciales reales.", specifications: [],
    price_from: productPrice, compare_at_price_from: productPrice, availability: "available", published: true,
    catalog_product_images: [],
    catalog_variants: [{
      id: "synthetic-price-variant", label: "Variante de prueba", price: variantPrice, compare_at_price: variantPrice,
      availability: "available", active: true,
    }],
  };
}

function priceSources(products: CatalogProduct[], variantId: string | null) {
  return retrieveApprovedSources({
    query: "¿Cuál es el precio de este colchón?", products, knowledge: [],
    selectedLead: { productId: "synthetic-price-product", variantId },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  fixture.rows = [];
  vi.stubEnv("SUPABASE_URL", "https://supabase.invalid");
  vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic-not-a-provider-credential");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network in price mapping tests."));
  const request = {
    select: fixture.select, eq: fixture.eq, order: fixture.order, in: fixture.in,
    maybeSingle: fixture.maybeSingle,
    then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
      Promise.resolve({ data: fixture.rows, error: null }).then(resolve),
  };
  for (const step of [fixture.from, fixture.select, fixture.eq, fixture.order, fixture.in]) step.mockReturnValue(request);
  fixture.createClient.mockReturnValue({ from: fixture.from });
  fixture.maybeSingle.mockImplementation(async () => ({ data: fixture.rows[0] ?? null, error: null }));
});

afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(fixture.getPhoneNumberInfo).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("catalog price mapping before RAG evidence", () => {
  it.each([
    { label: "null", value: null },
    { label: "empty string", value: "" },
    { label: "whitespace", value: " \t " },
    { label: "false", value: false },
    { label: "true", value: true },
    { label: "negative number", value: -1 },
    { label: "negative string", value: "-20.50" },
    { label: "undefined", value: undefined },
    { label: "not a number", value: Number.NaN },
    { label: "infinite number", value: Number.POSITIVE_INFINITY },
    { label: "nonnumeric string", value: "consultar" },
    { label: "array", value: [] },
    { label: "object", value: {} },
  ])("does not turn $label into a published price for either a product or variant", async ({ value }) => {
    fixture.rows = [productRow(value)];
    const { getPublishedCatalogProductsForRag } = await import("./server");
    const products = await getPublishedCatalogProductsForRag();
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ priceFrom: null, compareAtPriceFrom: null });
    expect(products[0].variants[0]).toMatchObject({ price: null, compareAtPrice: null });
    expect(fixture.eq).toHaveBeenCalledWith("published", true);

    for (const variantId of [null, "synthetic-price-variant"]) {
      const sources = priceSources(products, variantId);
      expect(sources).toHaveLength(1);
      expect(sources[0].content).not.toContain("Precio vigente:");
      expect(sources[0].content).not.toContain("Bs 0");
      expect(requiresHumanHandoffForQuery("¿Cuánto cuesta el colchón?", sources)).toBe(true);
    }
  });

  it.each([
    { label: "numeric zero", value: 0, expected: 0 },
    { label: "string zero", value: "0", expected: 0 },
    { label: "padded zero", value: " 0 ", expected: 0 },
    { label: "positive number", value: 999, expected: 999 },
    { label: "positive decimal string", value: "1299.50", expected: 1299.5 },
  ])("retains an explicit $label through the selected product lookup and RAG", async ({ value, expected }) => {
    fixture.rows = [productRow(value)];
    const { getProductForCatalogLead } = await import("./server");
    const selection = await getProductForCatalogLead("synthetic-price-product", "synthetic-price-variant");
    expect(selection?.product.priceFrom).toBe(expected);
    expect(selection?.variant?.price).toBe(expected);
    expect(selection?.product.compareAtPriceFrom).toBe(expected);
    expect(selection?.variant?.compareAtPrice).toBe(expected);
    expect(fixture.eq).toHaveBeenCalledWith("published", true);
    const sources = priceSources([selection!.product], "synthetic-price-variant");
    expect(sources[0].content).toMatch(/^Precio vigente: Bs \d/m);
    expect(requiresHumanHandoffForQuery("¿Cuánto cuesta el colchón?", sources)).toBe(false);
    if (expected === 0) expect(sources[0].content).toMatch(/^Precio vigente: Bs 0$/m);
  });

  it("does not substitute a base product price when the selected variant has no price", async () => {
    fixture.rows = [productRow(999, null)];
    const { getPublishedCatalogProductsForRagIds } = await import("./server");
    const products = await getPublishedCatalogProductsForRagIds(["synthetic-price-product"]);
    expect(products[0].priceFrom).toBe(999);
    expect(products[0].variants[0].price).toBeNull();
    expect(fixture.in).toHaveBeenCalledWith("id", ["synthetic-price-product"]);
    const sources = priceSources(products, "synthetic-price-variant");
    expect(sources[0].content).toContain("Precio de la variante seleccionada: sin precio publicado.");
    expect(sources[0].content).not.toContain("Precio vigente:");
    expect(requiresHumanHandoffForQuery("¿Cuál es el precio de esta variante?", sources)).toBe(true);
  });
});
