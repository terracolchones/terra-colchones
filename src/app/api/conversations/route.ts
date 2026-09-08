import { NextResponse, type NextRequest } from "next/server";
import { listConversations } from "@/lib/db";
import { requireDashboardAuth } from "@/lib/dashboard-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;

  return NextResponse.json(
    { conversations: listConversations() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
