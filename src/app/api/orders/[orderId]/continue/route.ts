import { NextResponse, type NextRequest } from "next/server";
import { dispatchOrderLocationRequest } from "@/lib/order-location";
import { getPhoneNumberInfo } from "@/lib/meta/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ orderId: string }>;
}

async function getTerraChatUrl(): Promise<string> {
  const info = await getPhoneNumberInfo();
  const phone = info.display_phone_number.replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(phone)) {
    throw new Error("Meta no devolvió un número de WhatsApp válido para Terra");
  }
  return `https://wa.me/${phone}`;
}

/**
 * Trigger del GPS al finalizar la landing.
 * El pedido ya está vinculado a la conversación de WhatsApp que originó la oferta,
 * y el enlace de retorno solo abre el chat de Terra, sin texto prellenado.
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
  if (result.status === "failed") {
    return NextResponse.json(
      { error: "No pudimos enviar el botón de ubicación. Inténtalo nuevamente." },
      { status: 503 },
    );
  }

  let chatUrl: string;
  try {
    chatUrl = await getTerraChatUrl();
  } catch (error) {
    console.error("[order] no se pudo preparar el regreso a WhatsApp:", error);
    return NextResponse.json(
      {
        error: result.status === "in_progress"
          ? "La ubicación está en proceso, pero no pudimos abrir el chat de Terra. Inténtalo nuevamente."
          : "La ubicación fue solicitada, pero no pudimos abrir el chat de Terra. Inténtalo nuevamente.",
      },
      { status: 503 },
    );
  }

  if (result.status === "in_progress") {
    // Un segundo toque no genera otro GPS; el primero ya está en curso.
    return NextResponse.json(
      { continued: true, deliveryPending: true, chatUrl },
      { status: 202 },
    );
  }

  return NextResponse.json({
    continued: true,
    alreadyRequested: result.status === "already_sent",
    chatUrl,
  });
}
