import { NextResponse, type NextRequest } from "next/server";
import { getPublishedProductBySlug } from "@/lib/catalog-storefront/server";
import {
  purchaseAvailability,
  purchaseUnavailableMessage,
} from "@/lib/catalog-storefront/purchase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CatalogOrderRequest {
  productSlug?: unknown;
  variantId?: unknown;
  checkoutToken?: unknown;
}

function configuredAgentUrl(): string | null {
  const value = process.env.ORDER_FLOW_AGENT_URL?.trim().replace(/\/$/, "");
  return value?.startsWith("https://") ? value : null;
}

function validCheckoutToken(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{24,128}$/.test(value)
    ? value
    : null;
}

function validOrderCode(value: unknown): value is string {
  return typeof value === "string" && /^T-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value);
}

export async function POST(request: NextRequest) {
  let payload: CatalogOrderRequest;
  try {
    payload = (await request.json()) as CatalogOrderRequest;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const slug =
    typeof payload.productSlug === "string" ? payload.productSlug.trim() : "";
  const variantId =
    typeof payload.variantId === "string" ? payload.variantId.trim() : null;
  if (
    !slug ||
    slug.length > 160 ||
    (variantId !== null && variantId.length > 128)
  ) {
    return NextResponse.json({ error: "Producto inválido" }, { status: 400 });
  }

  const product = await getPublishedProductBySlug(slug);
  if (!product) {
    return NextResponse.json(
      { error: "Este producto ya no está disponible" },
      { status: 409 },
    );
  }
  const variant = variantId
    ? (product.variants.find((item) => item.id === variantId && item.active) ??
      null)
    : null;
  if (variantId && !variant)
    return NextResponse.json(
      { error: "La opción seleccionada ya no está disponible" },
      { status: 409 },
    );
  if (!variantId && product.variants.some((item) => item.active)) {
    return NextResponse.json(
      { error: "Elige una opción del producto" },
      { status: 400 },
    );
  }
  const unavailableMessage = purchaseUnavailableMessage(
    purchaseAvailability(product, variant),
  );
  if (unavailableMessage) {
    return NextResponse.json(
      { error: unavailableMessage },
      { status: 409 },
    );
  }
  const selectionLabel =
    [
      variant?.showOptionText ? variant.label : null,
      variant?.showColor ? (variant.colorName ?? variant.colorHex) : null,
    ]
      .filter((item): item is string => Boolean(item))
      .join(" · ") || null;

  const agentUrl = configuredAgentUrl();
  const token = process.env.ORDER_FLOW_TOKEN;
  if (!agentUrl || !token) {
    console.error(
      "[catalog] falta configurar ORDER_FLOW_AGENT_URL u ORDER_FLOW_TOKEN",
    );
    return NextResponse.json(
      { error: "La confirmación de pedidos no está disponible todavía" },
      { status: 503 },
    );
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
        productName: variant?.name || product.name,
        variantId: variant?.id ?? null,
        variantLabel: selectionLabel,
        price: variant?.price ?? product.priceFrom,
        checkoutToken: validCheckoutToken(payload.checkoutToken),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => null)) as {
      orderCode?: unknown;
      error?: unknown;
    } | null;
    if (!response.ok || !validOrderCode(body?.orderCode)) {
      const error =
        typeof body?.error === "string" && response.status < 500
          ? body.error
          : "No pudimos crear el pedido. Inténtalo nuevamente.";
      return NextResponse.json(
        { error },
        { status: response.ok || response.status >= 500 ? 502 : response.status },
      );
    }
    return NextResponse.json({ orderCode: body.orderCode }, { status: 201 });
  } catch (error) {
    console.error("[catalog] no se pudo crear el pedido en el agente:", error);
    return NextResponse.json(
      { error: "No pudimos crear el pedido. Inténtalo nuevamente." },
      { status: 502 },
    );
  }
}
