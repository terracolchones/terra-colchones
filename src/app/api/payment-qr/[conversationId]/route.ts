import { NextResponse, type NextRequest } from "next/server";
import { getConversationById } from "@/lib/db";
import { sendPaymentQr } from "@/lib/payment-qr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Context {
  params: Promise<{ conversationId: string }>;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(_request: NextRequest, { params }: Context) {
  const id = parseId((await params).conversationId);
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const conversation = getConversationById(id);
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (conversation.mode !== "HUMAN") {
    return NextResponse.json({ error: "Activa el modo HUMANO antes de enviar el QR" }, { status: 409 });
  }

  try {
    await sendPaymentQr(conversation.id, conversation.phone);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: message, outside24h: message.includes("131047") },
      { status: 502 },
    );
  }
}
