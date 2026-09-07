import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  completePaymentQrDelivery,
  failPaymentQrDelivery,
  getOrCreateConversation,
  reservePaymentQrDelivery,
} from "@/lib/db";
import { sendPaymentQr } from "@/lib/payment-qr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ConfirmationPayload {
  orderId?: unknown;
  customerPhone?: unknown;
  customerName?: unknown;
}

function authorized(request: NextRequest): boolean {
  const expected = process.env.ORDER_CONFIRMATION_TOKEN;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return expectedBytes.length === providedBytes.length && crypto.timingSafeEqual(expectedBytes, providedBytes);
}

function orderId(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) ? value : null;
}

function customerPhone(value: unknown): string | null {
  return typeof value === "string" && /^\d{8,15}$/.test(value) ? value : null;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let payload: ConfirmationPayload;
  try {
    payload = await request.json() as ConfirmationPayload;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const confirmedOrderId = orderId(payload.orderId);
  const phone = customerPhone(payload.customerPhone);
  const name = typeof payload.customerName === "string" ? payload.customerName.slice(0, 120) : null;
  if (!confirmedOrderId || !phone) {
    return NextResponse.json(
      { error: "orderId y customerPhone (solo dígitos, con código de país) son obligatorios" },
      { status: 400 },
    );
  }

  const reservation = reservePaymentQrDelivery(confirmedOrderId, phone);
  if (reservation === "already_sent") {
    return NextResponse.json({ ok: true, alreadySent: true });
  }
  if (reservation === "in_progress") {
    return NextResponse.json({ error: "El QR de este pedido se está enviando" }, { status: 409 });
  }

  const conversation = getOrCreateConversation(phone, name);
  try {
    const { waMessageId } = await sendPaymentQr(conversation.id, conversation.phone);
    completePaymentQrDelivery(confirmedOrderId, waMessageId);
    return NextResponse.json({ ok: true, alreadySent: false });
  } catch (error) {
    failPaymentQrDelivery(confirmedOrderId);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: message, outside24h: message.includes("131047") },
      { status: 502 },
    );
  }
}
