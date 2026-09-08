import { NextResponse, type NextRequest } from "next/server";
import {
  getConversationById,
  getMessages,
  insertMessage,
  updateMessageWaId,
} from "@/lib/db";
import { sendTextMessage } from "@/lib/meta/client";
import { requireDashboardAuth } from "@/lib/dashboard-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Context {
  params: Promise<{ conversationId: string }>;
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest, { params }: Context) {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;

  const id = parseId((await params).conversationId);
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const conversation = getConversationById(id);
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(
    { conversation, messages: getMessages(id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest, { params }: Context) {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;

  const id = parseId((await params).conversationId);
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const conversation = getConversationById(id);
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (conversation.mode !== "HUMAN") {
    return NextResponse.json({ error: "Activa el modo HUMANO antes de enviar" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const content =
    typeof body === "object" && body !== null && "content" in body && typeof body.content === "string"
      ? body.content.trim()
      : "";
  if (!content) return NextResponse.json({ error: "El mensaje no puede estar vacío" }, { status: 400 });
  if (content.length > 4096) {
    return NextResponse.json({ error: "WhatsApp permite un máximo de 4096 caracteres" }, { status: 400 });
  }

  const messageId = insertMessage(conversation.id, "human", content, null);
  try {
    const { wa_message_id } = await sendTextMessage(conversation.phone, content);
    updateMessageWaId(messageId, wa_message_id);
    return NextResponse.json({ ok: true, messageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, messageId, error: message, outside24h: message.includes("131047") },
      { status: 502 },
    );
  }
}
