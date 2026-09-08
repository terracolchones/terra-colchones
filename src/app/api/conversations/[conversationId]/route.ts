import { NextResponse, type NextRequest } from "next/server";
import { deleteConversation, getConversationById } from "@/lib/db";
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

export async function DELETE(request: NextRequest, { params }: Context) {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;

  const id = parseId((await params).conversationId);
  if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  if (!getConversationById(id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  deleteConversation(id);
  return NextResponse.json({ ok: true });
}
