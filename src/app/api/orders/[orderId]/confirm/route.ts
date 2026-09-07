import { NextResponse, type NextRequest } from "next/server";
import { isLoungeColor } from "@/lib/catalog";
import { confirmOrderFromLanding, getOrderById } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { orderId } = await context.params;
  let payload: { color?: unknown };
  try {
    payload = (await request.json()) as { color?: unknown };
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  if (!/^TERRA-[A-Z0-9]{12}$/.test(orderId) || !isLoungeColor(payload.color)) {
    return NextResponse.json({ error: "Pedido o color inválido" }, { status: 400 });
  }

  const beforeConfirmation = getOrderById(orderId);
  if (!beforeConfirmation) return NextResponse.json({ error: "El pedido no existe" }, { status: 404 });
  if (beforeConfirmation.status !== "draft" && beforeConfirmation.status !== "awaiting_location") {
    return NextResponse.json({ error: "Este pedido ya no puede modificarse" }, { status: 409 });
  }
  if (beforeConfirmation.status === "awaiting_location" && beforeConfirmation.color !== payload.color) {
    return NextResponse.json({ error: "Este pedido ya no puede modificarse" }, { status: 409 });
  }

  const order = confirmOrderFromLanding(orderId, payload.color);
  if (!order) return NextResponse.json({ error: "El pedido no existe" }, { status: 404 });
  if (order.color !== payload.color || order.status !== "awaiting_location") {
    return NextResponse.json({ error: "Este pedido ya no puede modificarse" }, { status: 409 });
  }

  // Confirmar únicamente guarda la selección. El GPS se solicita cuando el
  // cliente pulsa “Volver al chat” al final de la landing.
  return NextResponse.json({ confirmed: true });
}
