import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVELOPMENT_CATALOG_PREVIEW } from "@/lib/catalog-storefront/demo";
import { purchaseAvailability, purchaseUnavailableMessage } from "@/lib/catalog-storefront/purchase";
import { POST } from "./route";

const { getProduct } = vi.hoisted(() => ({ getProduct: vi.fn() }));
vi.mock("@/lib/catalog-storefront/server", () => ({ getPublishedProductBySlug: getProduct }));

let product = structuredClone(DEVELOPMENT_CATALOG_PREVIEW[0]);
let fetchAgent = vi.fn();

function request(body: unknown) {
  return new NextRequest("https://catalog.example/api/catalog-orders", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  product = structuredClone(DEVELOPMENT_CATALOG_PREVIEW[0]);
  getProduct.mockReset().mockImplementation(async () => product);
  fetchAgent = vi.fn().mockResolvedValue(Response.json({ orderCode: "T-7Q4K-8M2P" }, { status: 201 }));
  vi.stubGlobal("fetch", fetchAgent);
  vi.stubEnv("ORDER_FLOW_AGENT_URL", "https://agent.example");
  vi.stubEnv("ORDER_FLOW_TOKEN", "test-only-token");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("confirmación y disponibilidad del catálogo", () => {
  it("permite una versión disponible aunque la familia esté en Próximamente", async () => {
    product.availability = "coming_soon";
    product.variants[0].availability = "available";
    expect(purchaseUnavailableMessage(purchaseAvailability(product, product.variants[0]))).toBeNull();
    const response = await POST(request({ productSlug: product.slug, variantId: product.variants[0].id }));
    expect(response.status).toBe(201);
    const sent = JSON.parse(fetchAgent.mock.calls[0][1].body);
    expect(sent.variantId).toBe(product.variants[0].id);
    expect(sent.price).toBe(product.variants[0].price);
  });

  it.each(["coming_soon", "out_of_stock"] as const)("rechaza una versión %s antes de llamar al agente", async (availability) => {
    product.variants[0].availability = availability;
    const response = await POST(request({ productSlug: product.slug, variantId: product.variants[0].id }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(purchaseUnavailableMessage(purchaseAvailability(product, product.variants[0])));
    expect(fetchAgent).not.toHaveBeenCalled();
  });

  it("informa Próximamente para un producto sin variantes", async () => {
    product.variants = [];
    product.availability = "coming_soon";
    const response = await POST(request({ productSlug: product.slug }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Próximamente");
    expect(fetchAgent).not.toHaveBeenCalled();
  });

  it("no permite omitir la variante para saltar la validación de stock", async () => {
    const response = await POST(request({ productSlug: product.slug }));
    expect(response.status).toBe(400);
    expect(fetchAgent).not.toHaveBeenCalled();
  });

  it("rechaza una variante de otro producto o inactiva", async () => {
    product.variants[0].active = false;
    for (const variantId of [product.variants[0].id, "unknown-variant"]) {
      expect((await POST(request({ productSlug: product.slug, variantId }))).status).toBe(409);
    }
    expect(fetchAgent).not.toHaveBeenCalled();
  });

  it("acepta un producto disponible sin variantes", async () => {
    product.variants = [];
    expect((await POST(request({ productSlug: product.slug }))).status).toBe(201);
  });

  it("rechaza cuerpos JSON que no son objetos", async () => {
    for (const body of [null, [], "invalid"]) expect((await POST(request(body))).status).toBe(400);
    expect(getProduct).not.toHaveBeenCalled();
  });

  it("devuelve error HTTP cuando el agente responde sin un código válido", async () => {
    product.variants = [];
    fetchAgent.mockResolvedValue(Response.json({ orderCode: "invalid" }));
    expect((await POST(request({ productSlug: product.slug }))).status).toBe(502);
  });
});
