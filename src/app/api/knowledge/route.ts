import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { createKnowledgeDraft, KnowledgeServiceError, listKnowledgeDocuments } from "@/lib/rag/knowledge";
import { parseKnowledgeDraftInput } from "@/lib/rag/knowledge-input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown): NextResponse {
  const message = error instanceof KnowledgeServiceError ? error.message : "No se pudo completar la operación de conocimiento.";
  return NextResponse.json({ error: message }, { status: error instanceof KnowledgeServiceError ? 400 : 500 });
}

export async function GET(request: NextRequest) {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;
  try {
    return NextResponse.json({ documents: await listKnowledgeDocuments() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;
  try {
    const input = parseKnowledgeDraftInput(await request.json());
    if (!input) return NextResponse.json({ error: "Los datos del borrador no son válidos." }, { status: 400 });
    return NextResponse.json({ document: await createKnowledgeDraft(input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
