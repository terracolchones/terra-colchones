import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CatalogProduct, CatalogVariant } from "./types";

interface StoredLink { code: string; product_id: string | null; variant_id: string | null; target_kind: string; created_at?: string }

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  rows: new Map<string, StoredLink>(),
  products: new Map<string, CatalogProduct>(),
  configured: true,
  storageFailed: false,
  inserts: 0,
  numbers: [] as number[],
}));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: (min: number, max?: number) => state.numbers.length ? state.numbers.shift()! : max === undefined ? actual.randomInt(min) : actual.randomInt(min, max) };
});
vi.mock("./server", () => ({
  isCatalogConfigured: () => state.configured,
  getPublishedCatalogEntryBySlug: async (slug: string) => {
    const product = [...state.products.values()].find((item) => item.published && (item.slug === slug || item.variants.some((variant) => variant.slug === slug && variant.active)));
    if (!product) return null;
    return { product, selectedVariantId: product.variants.find((variant) => variant.slug === slug && variant.active)?.id ?? null };
  },
  getProductForCatalogLead: async (id: string, variantId: string | null) => { const product = state.products.get(id); return product?.published ? { product, variant: product.variants.find((item) => item.id === variantId && item.active) ?? null } : null; },
  getCatalogServerClient: () => ({
    from: () => ({
      select: () => {
        const filters: Array<(row: StoredLink) => boolean> = [];
        const matching = () => [...state.rows.values()].filter((row) => filters.every((filter) => filter(row)));
        const query = {
          eq(field: keyof StoredLink, value: string) { filters.push((row) => row[field] === value); return query; },
          not() { filters.push((row) => row.product_id !== null); return query; },
          order() { return query; },
          async maybeSingle() { return state.storageFailed ? { data: null, error: { code: "42P01", message: "private database diagnostic" } } : { data: matching()[0] ?? null, error: null }; },
          async range(start: number, end: number) {
            return { data: matching().slice(start, end + 1).map((row) => ({ ...row, created_at: "2026-09-16T12:00:00Z", product: state.products.get(row.product_id!), variant: state.products.get(row.product_id!)?.variants.find((variant) => variant.id === row.variant_id) ?? null })), error: state.storageFailed ? { code: "42P01" } : null };
          },
        };
        return query;
      },
      update: (patch: Partial<StoredLink>) => ({ eq: async (_field: string, code: string) => {
        if (state.storageFailed) return { error: { code: "42P01" } };
        const row = state.rows.get(code); if (row) Object.assign(row, patch);
        return { error: null };
      } }),
      insert: async (row: StoredLink) => {
        state.inserts++;
        if (state.rows.has(row.code) || [...state.rows.values()].some((item) => item.product_id === row.product_id && item.target_kind === row.target_kind && item.variant_id === row.variant_id)) return { error: { code: "23505" } };
        state.rows.set(row.code, row);
        return { error: null };
      },
    }),
  }),
}));

import { createProductShortLink, getEntryByShortCode, listProductShortLinks, removeProductShortLink } from "./short-links-server";
import { POST, GET, DELETE } from "../../app/api/catalog/admin/short-links/route";

const origin = "https://terracolchonesymuebles.online";
const product: CatalogProduct = { id: "test-internal-id", slug: "sabana-teka", name: "Sábana de prueba", published: true, externalCode: null, category: "Prueba", shortDescription: "", description: "", specifications: [], priceFrom: 10, compareAtPriceFrom: null, availability: "available", featured: false, sortOrder: 1, images: [], variants: [] };
const productUrl = `${origin}/catalogo/productos/${product.slug}`;

beforeEach(() => {
  state.rows.clear(); state.products.clear(); state.products.set(product.id, { ...product, variants: [] });
  state.configured = true; state.storageFailed = false; state.inserts = 0; state.numbers = [];
  vi.stubEnv("CATALOG_ADMIN_PASSWORD", "test-admin-only");
});
afterEach(() => vi.unstubAllEnvs());

describe("persistencia y resolución", () => {
  it("devuelve el mismo código después de repetir la solicitud o cambiar el slug", async () => {
    const first = await createProductShortLink(productUrl);
    expect(first.created).toBe(true);
    expect(first.link.code).toHaveLength(3);
    expect(await createProductShortLink(productUrl)).toEqual({ ...first, created: false });
    state.products.get(product.id)!.slug = "nuevo-nombre";
    const next = await createProductShortLink(`${origin}/catalogo/productos/nuevo-nombre`);
    expect(next.link.code).toBe(first.link.code);
    expect((await getEntryByShortCode(first.link.code))?.product.slug).toBe("nuevo-nombre");
    expect(JSON.stringify(next)).not.toContain(product.id);
  });

  it("converge a un solo enlace cuando llegan solicitudes simultáneas", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => createProductShortLink(productUrl)));
    expect(new Set(results.map((result) => result.link.code)).size).toBe(1);
    expect(state.rows.size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
  });

  it("reintenta colisiones sin reutilizar códigos huérfanos y amplía el código", async () => {
    state.rows.set("2aa", { code: "2aa", product_id: null, variant_id: null, target_kind: "product" });
    state.numbers = Array.from({ length: 12 }, () => [2, 0, 0]).flat().concat([2, 0, 0, 0]);
    const result = await createProductShortLink(productUrl);
    expect(result.link.code).toBe("2aaa");
    expect(state.rows.get("2aa")?.product_id).toBeNull();
    expect(state.inserts).toBe(13);
  });

  it("no muestra productos retirados, eliminados o códigos inexistentes", async () => {
    const result = await createProductShortLink(productUrl);
    state.products.get(product.id)!.published = false;
    expect(await getEntryByShortCode(result.link.code)).toBeNull();
    await expect(createProductShortLink(productUrl)).rejects.toMatchObject({ status: 404 });
    state.rows.get(result.link.code)!.product_id = null;
    expect(await getEntryByShortCode(result.link.code)).toBeNull();
    expect(await getEntryByShortCode("9zzzzzzz")).toBeNull();
    expect(await getEntryByShortCode("api")).toBeNull();
  });

  it("acepta productos añadidos después sin cambios de código", async () => {
    state.products.set("test-new-product", { ...product, id: "test-new-product", slug: "producto-futuro" });
    const result = await createProductShortLink(`${origin}/catalogo/productos/producto-futuro`);
    expect((await getEntryByShortCode(result.link.code))?.product.slug).toBe("producto-futuro");
  });

  it("conserva la variante exacta y no abre otra al retirarla o eliminarla", async () => {
    const variant: CatalogVariant = { id: "variant-1", name: "Versión roja", slug: "version-roja", active: true, label: "Rojo", externalCode: null, colorHex: null, colorName: null, showColor: false, showOptionText: true, isPrimary: false, price: 20, compareAtPrice: null, availability: "available", sortOrder: 1, images: [] };
    state.products.get(product.id)!.variants.push(variant);
    const family = await createProductShortLink(productUrl);
    const result = await createProductShortLink(`${origin}/catalogo/productos/version-roja`);
    expect(result.link.code).not.toBe(family.link.code);
    expect(result.link.productName).toBe("Versión roja");
    expect((await getEntryByShortCode(result.link.code))?.selectedVariantId).toBe(variant.id);
    variant.slug = "version-renombrada";
    expect((await createProductShortLink(`${origin}/catalogo/productos/version-renombrada`)).link.code).toBe(result.link.code);
    variant.active = false;
    expect(await getEntryByShortCode(result.link.code)).toBeNull();
    state.rows.get(result.link.code)!.variant_id = null;
    expect(await getEntryByShortCode(result.link.code)).toBeNull();
  });

  it("lista enlaces persistidos sin IDs y elimina solo el acceso corto", async () => {
    const { link } = await createProductShortLink(productUrl);
    const listed = await listProductShortLinks(0);
    expect(listed.links[0]).toMatchObject({ code: link.code, available: true });
    expect(JSON.stringify(listed)).not.toContain(product.id);
    await removeProductShortLink(link.code);
    expect((await listProductShortLinks(0)).links).toEqual([]);
    expect(await getEntryByShortCode(link.code)).toBeNull();
    expect(state.products.get(product.id)?.published).toBe(true);
    const replacement = await createProductShortLink(productUrl);
    expect(replacement.link.code).not.toBe(link.code);
    expect(state.rows.has(link.code)).toBe(true);
  });

  it("pagina sin truncar el historial y rechaza páginas inválidas", async () => {
    for (let index = 0; index < 31; index++) state.rows.set(`key-${index}`, { code: `key-${index}`, product_id: product.id, variant_id: null, target_kind: "product" });
    expect(await listProductShortLinks(0)).toMatchObject({ hasMore: true });
    expect((await listProductShortLinks(0)).links).toHaveLength(30);
    expect((await listProductShortLinks(1)).links).toHaveLength(1);
    await expect(listProductShortLinks(-1)).rejects.toMatchObject({ status: 400 });
  });
});

function request(body: string, password = "test-admin-only") {
  return new NextRequest(`${origin}/api/catalog/admin/short-links`, { method: "POST", headers: { "Content-Type": "application/json", "X-Catalog-Admin-Key": password }, body });
}

describe("API administrativa", () => {
  it("protege también el historial y la eliminación", async () => {
    for (const handler of [GET, DELETE]) {
      const response = await handler(new NextRequest(`${origin}/api/catalog/admin/short-links?code=7k3`));
      expect(response.status).toBe(401);
    }
  });
  it("exige la clave antes de leer o guardar enlaces", async () => {
    const response = await POST(request(JSON.stringify({ url: productUrl }), "incorrect"));
    expect(response.status).toBe(401);
    expect(state.inserts).toBe(0);
  });

  it("crea y recupera enlaces sin caché ni identificadores internos", async () => {
    const response = await POST(request(JSON.stringify({ url: productUrl })));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain(product.id);
    expect((await POST(request(JSON.stringify({ url: productUrl })))).status).toBe(200);
  });

  it.each(["{bad-json", "null", JSON.stringify({ url: "https://example.com/product" }), JSON.stringify({ url: `${productUrl}?checkout=private-context` }), " ".repeat(4097)])("rechaza entradas inválidas sin persistir", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(state.inserts).toBe(0);
  });

  it("informa almacenamiento no disponible sin exponer diagnósticos internos", async () => {
    state.storageFailed = true;
    const response = await POST(request(JSON.stringify({ url: productUrl })));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database diagnostic");
  });
});
