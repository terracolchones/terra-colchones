import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { KnowledgeServiceError, saveKnowledgeDraft } from "@/lib/rag/knowledge";
import { parseKnowledgeDraftInput } from "@/lib/rag/knowledge-input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Context { params: Promise<{ documentId: string }> }

export async function PUT(request: NextRequest, { params }: Context) {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;
  const documentId = (await params).documentId;
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
  try {
    const input = parseKnowledgeDraftInput(await request.json());
    if (!input) return NextResponse.json({ error: "Los datos del borrador no son válidos." }, { status: 400 });
    return NextResponse.json({ document: await saveKnowledgeDraft(documentId, input) });
  } catch (error) {
    const message = error instanceof KnowledgeServiceError ? error.message : "No se pudo guardar el borrador.";
    return NextResponse.json({ error: message }, { status: error instanceof KnowledgeServiceError ? 400 : 500 });
  }
}
