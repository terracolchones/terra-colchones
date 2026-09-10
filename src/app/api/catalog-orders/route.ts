import { NextResponse, type NextRequest } from "next/server";
import { colorVariantHex, isColorVariant } from "@/lib/catalog-storefront/color-variants";
import { getPublishedProductBySlug } from "@/lib/catalog-storefront/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CatalogOrderRequest {
  productSlug?: unknown;
  variantId?: unknown;
  colorVariantId?: unknown;
  checkoutToken?: unknown;
}

function configuredAgentUrl(): string | null {
  const value = process.env.ORDER_FLOW_AGENT_URL?.trim().replace(/\/$/, "");
  return value?.startsWith("https://") ? value : null;
}

function validCheckoutToken(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{24,128}$/.test(value) ? value : null;
}

function validOrderCode(value: unknown): value is string {
  return typeof value === "string" && /^T-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value);
}

export async function POST(request: NextRequest) {
  let payload: CatalogOrderRequest;
  try {
    payload = await request.json() as CatalogOrderRequest;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const slug = typeof payload.productSlug === "string" ? payload.productSlug.trim() : "";
  const variantId = typeof payload.variantId === "string" ? payload.variantId.trim() : null;
  const colorVariantId = typeof payload.colorVariantId === "string" ? payload.colorVariantId.trim() : null;
  if (!slug || slug.length > 160 || (variantId !== null && variantId.length > 128) || (colorVariantId !== null && colorVariantId.length > 128)) {
    return NextResponse.json({ error: "Producto inválido" }, { status: 400 });
  }

  const product = await getPublishedProductBySlug(slug);
  if (!product || product.availability !== "available") {
    return NextResponse.json({ error: "Este producto ya no está disponible" }, { status: 409 });
  }
  const variant = variantId ? product.variants.find((item) => item.id === variantId && item.active && !isColorVariant(item)) ?? null : null;
  if (variantId && !variant) return NextResponse.json({ error: "La opción seleccionada ya no está disponible" }, { status: 409 });
  if (variant && variant.availability !== "available") {
    return NextResponse.json({ error: "La opción seleccionada ya no está disponible" }, { status: 409 });
  }
  const colorVariant = colorVariantId ? product.variants.find((item) => item.id === colorVariantId && item.active && isColorVariant(item)) ?? null : null;
  if (colorVariantId && !colorVariant) return NextResponse.json({ error: "El color seleccionado ya no está disponible" }, { status: 409 });
  if (colorVariant && colorVariant.availability !== "available") {
    return NextResponse.json({ error: "El color seleccionado ya no está disponible" }, { status: 409 });
  }
  const colorHex = colorVariant ? colorVariantHex(colorVariant.label) : null;
  const selectionLabel = [variant?.label ?? null, colorHex].filter((item): item is string => Boolean(item)).join(" · ") || null;

  const agentUrl = configuredAgentUrl();
  const token = process.env.ORDER_FLOW_TOKEN;
  if (!agentUrl || !token) {
    console.error("[catalog] falta configurar ORDER_FLOW_AGENT_URL u ORDER_FLOW_TOKEN");
    return NextResponse.json({ error: "La confirmación de pedidos no está disponible todavía" }, { status: 503 });
  }

  try {
    const response = await fetch(`${agentUrl}/api/catalog-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Terra-Order-Token": token,
      },
      body: JSON.stringify({
        productId: product.id,
        productSlug: product.slug,
        productName: product.name,
        variantId: variant?.id ?? null,
        variantLabel: selectionLabel,
        price: variant?.price ?? product.priceFrom,
        checkoutToken: validCheckoutToken(payload.checkoutToken),
      }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null) as { orderCode?: unknown; error?: unknown } | null;
    if (!response.ok || !validOrderCode(body?.orderCode)) {
      const error = typeof body?.error === "string" && response.status < 500
        ? body.error
        : "No pudimos crear el pedido. Inténtalo nuevamente.";
      return NextResponse.json({ error }, { status: response.status >= 500 ? 502 : response.status });
    }
    return NextResponse.json({ orderCode: body.orderCode }, { status: 201 });
  } catch (error) {
    console.error("[catalog] no se pudo crear el pedido en el agente:", error);
    return NextResponse.json({ error: "No pudimos crear el pedido. Inténtalo nuevamente." }, { status: 502 });
  }
}
