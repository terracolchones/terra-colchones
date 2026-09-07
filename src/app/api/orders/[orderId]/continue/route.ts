import { NextResponse, type NextRequest } from "next/server";
import { dispatchOrderLocationRequest } from "@/lib/order-location";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

/**
 * Trigger del GPS al finalizar la landing.
 * El pedido ya está vinculado a la conversación de WhatsApp que originó la oferta,
 * por lo que nunca usamos enlaces wa.me ni texto prellenado.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  const { orderId } = await context.params;
  if (!/^TERRA-[A-Z0-9]{12}$/.test(orderId)) {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  const result = await dispatchOrderLocationRequest(orderId);
  if (result.status === "not_found") {
    return NextResponse.json({ error: "El pedido no existe" }, { status: 404 });
  }
  if (result.status === "not_ready") {
    return NextResponse.json({ error: "Este pedido todavía no está listo para solicitar ubicación" }, { status: 409 });
  }
  if (result.status === "already_sent") {
    return NextResponse.json({ continued: true, alreadyRequested: true });
  }
  if (result.status === "in_progress") {
    // Un segundo toque no genera otro GPS; el primero ya está en curso.
    return NextResponse.json({ continued: true, deliveryPending: true }, { status: 202 });
  }
  if (result.status === "sent") return NextResponse.json({ continued: true, alreadyRequested: false });
  return NextResponse.json(
    { error: "No pudimos enviar el botón de ubicación. Inténtalo nuevamente." },
    { status: 503 },
  );
}
