import { NextResponse, type NextRequest } from "next/server";
import { deleteCatalogProduct, jsonError, parseProductInput, requireCatalogAdmin, updateCatalogProduct } from "@/lib/catalog-storefront/admin-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ productId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireCatalogAdmin(request);
    const { productId } = await context.params;
    await updateCatalogProduct(productId, parseProductInput(await request.json()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireCatalogAdmin(request);
    const { productId } = await context.params;
    await deleteCatalogProduct(productId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
