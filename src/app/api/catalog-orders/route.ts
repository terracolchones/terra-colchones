import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  createCatalogOrder,
  getCheckoutSessionConversation,
  type CatalogOrderInput,
} from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CreateOrderPayload {
  productId?: unknown;
  productSlug?: unknown;
  productName?: unknown;
  variantId?: unknown;
  variantLabel?: unknown;
  price?: unknown;
  checkoutToken?: unknown;
}

function authorized(request: NextRequest): boolean {
  const expected = process.env.ORDER_FLOW_TOKEN;
  const provided = request.headers.get("x-terra-order-token");
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return expectedBytes.length === providedBytes.length && crypto.timingSafeEqual(expectedBytes, providedBytes);
}

function text(value: unknown, maximum: number, required = false): string | null {
  if (typeof value !== "string") return required ? null : null;
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) return null;
  return normalized || null;
}

function parseInput(payload: CreateOrderPayload): { input: CatalogOrderInput; checkoutToken: string | null } | null {
  const productId = text(payload.productId, 128, true);
  const productSlug = text(payload.productSlug, 160, true);
  const productName = text(payload.productName, 180, true);
  const variantId = text(payload.variantId, 128);
  const variantLabel = text(payload.variantLabel, 180);
  const price = payload.price === null || payload.price === undefined
    ? null
    : typeof payload.price === "number" && Number.isFinite(payload.price) && payload.price >= 0 && payload.price <= 1_000_000
      ? payload.price
      : Number.NaN;
  const checkoutToken = text(payload.checkoutToken, 128);
  if (!productId || !productSlug || !productName || Number.isNaN(price)) return null;
  return {
    input: { productId, productSlug, productName, variantId, variantLabel, price },
    checkoutToken,
  };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let payload: CreateOrderPayload;
  try {
    payload = await request.json() as CreateOrderPayload;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = parseInput(payload);
  if (!parsed) return NextResponse.json({ error: "Datos de pedido inválidos" }, { status: 400 });

  const conversationId = getCheckoutSessionConversation(parsed.checkoutToken);
  if (parsed.checkoutToken && !conversationId) {
    return NextResponse.json({ error: "La sesión de compra ya no es válida. Vuelve a abrir el catálogo desde WhatsApp." }, { status: 422 });
  }

  const order = createCatalogOrder(parsed.input, conversationId);
  return NextResponse.json({ orderCode: order.public_code }, { status: 201 });
}
