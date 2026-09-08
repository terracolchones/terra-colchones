import { NextResponse, type NextRequest } from "next/server";
import { getConversationById, setMode, type ConversationMode } from "@/lib/db";
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

export async function POST(request: NextRequest, { params }: Context) {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;

  const id = parseId((await params).conversationId);
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  if (!getConversationById(id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const mode =
    typeof body === "object" && body !== null && "mode" in body && (body.mode === "AI" || body.mode === "HUMAN")
      ? (body.mode as ConversationMode)
      : null;
  if (!mode) return NextResponse.json({ error: "Modo inválido" }, { status: 400 });

  return NextResponse.json({ ok: true, conversation: setMode(id, mode) });
}
