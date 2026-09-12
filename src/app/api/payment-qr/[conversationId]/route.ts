import { NextResponse, type NextRequest } from "next/server";
import { getConversationById, getLatestActiveCatalogOrderForConversation } from "@/lib/db";
import { dispatchCatalogPaymentQr, type CatalogPaymentQrDispatch } from "@/lib/catalog-payment-flow";
import { requireDashboardAuth } from "@/lib/dashboard-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Context {
  params: Promise<{ conversationId: string }>;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const NO_STORE = { "Cache-Control": "no-store" };
const RESULT_MESSAGES: Record<Exclude<CatalogPaymentQrDispatch, "sent">, string> = {
  already_sent: "Meta ya aceptó el QR de este pedido. No se enviará otra vez.",
  in_progress: "El envío del QR está pendiente de confirmación. Revisa el intento anterior; no lo repetiremos.",
  uncertain: "No se pudo confirmar el resultado del envío. Revisa el intento anterior; no lo repetiremos.",
  accepted_persistence_failed: "Meta aceptó el QR, pero falta completar su registro local. No lo repetiremos.",
  not_ready: "El pedido debe estar confirmado y tener su ubicación registrada antes de enviar el QR.",
  failed: "No se pudo preparar el QR. No se intentó enviar; comprueba su configuración antes de volver a solicitarlo.",
  suppressed: "La conversación cambió de modo o de asociación. Revisa el pedido y activa HUMANO para continuar.",
};

function isPanelOrigin(request: NextRequest): boolean {
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get("host") ?? requestUrl.host;
    if (!host || /[\s\\/@?#]/.test(host)) return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    return request.headers.get("origin") === new URL(`${requestUrl.protocol}//${host}`).origin
      && (fetchSite === null || fetchSite === "same-origin");
  } catch { return false; }
}

export async function POST(request: NextRequest, { params }: Context) {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;
  if (!isPanelOrigin(request)) {
    return NextResponse.json({ error: "Envía el QR desde el panel del agente." }, { status: 403, headers: NO_STORE });
  }

  const id = parseId((await params).conversationId);
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const requestedOrder = request.headers.get("x-terra-order-code");
  if (!requestedOrder || !/^T-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(requestedOrder)) {
    return NextResponse.json({ error: "Actualiza el panel y selecciona el pedido antes de enviar su QR." }, { status: 400, headers: NO_STORE });
  }

  const conversation = getConversationById(id);
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (conversation.mode !== "HUMAN") {
    return NextResponse.json({ error: "Activa el modo HUMANO antes de enviar el QR" }, { status: 409 });
  }

  try {
    const order = getLatestActiveCatalogOrderForConversation(conversation.id);
    if (!order) {
      return NextResponse.json({ error: "Primero confirma el producto desde el catálogo para vincular el QR a un pedido." }, { status: 409, headers: NO_STORE });
    }
    if (order.public_code !== requestedOrder) {
      return NextResponse.json({ error: "El pedido de la conversación cambió. Actualiza el panel y revisa el pedido antes de enviar su QR." }, { status: 409, headers: NO_STORE });
    }
    const result = await dispatchCatalogPaymentQr(order.id, { mode: "HUMAN", conversationId: conversation.id });
    if (result === "sent") return NextResponse.json({ ok: true }, { headers: NO_STORE });
    return NextResponse.json({ ok: false, error: RESULT_MESSAGES[result] }, {
      status: result === "failed" ? 503 : 409, headers: NO_STORE,
    });
  } catch {
    // Neither a persistence error nor an ambiguous transport result permits a retry.
    return NextResponse.json(
      { ok: false, error: "No se pudo completar la operación. Revisa el estado del pedido antes de volver a solicitar un envío." },
      { status: 503, headers: NO_STORE },
    );
  }
}
