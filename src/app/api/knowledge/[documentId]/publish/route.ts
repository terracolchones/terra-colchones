import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { KnowledgeServiceError, publishKnowledgeDraft } from "@/lib/rag/knowledge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Context { params: Promise<{ documentId: string }> }

export async function POST(request: NextRequest, { params }: Context) {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;
  const documentId = (await params).documentId;
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
  try {
    return NextResponse.json({ document: await publishKnowledgeDraft(documentId) });
  } catch (error) {
    const message = error instanceof KnowledgeServiceError ? error.message : "No se pudo publicar el conocimiento.";
    return NextResponse.json({ error: message }, { status: error instanceof KnowledgeServiceError ? 400 : 500 });
  }
}
