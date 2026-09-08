import { NextResponse, type NextRequest } from "next/server";
import { getAdminHomeSettings, jsonError, requireCatalogAdmin, saveAdminHomeSettings } from "@/lib/catalog-storefront/admin-server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;

  try {
    await requireCatalogAdmin(request);
    return NextResponse.json({ home: await getAdminHomeSettings() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;

  try {
    await requireCatalogAdmin(request);
    await saveAdminHomeSettings(await request.json());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
