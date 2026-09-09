import { NextResponse, type NextRequest } from "next/server";
import { createCatalogProduct, jsonError, listCatalogForAdmin, parseProductInput, requireCatalogAdmin } from "@/lib/catalog-storefront/admin-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireCatalogAdmin(request);
    return NextResponse.json({ products: await listCatalogForAdmin() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCatalogAdmin(request);
    const productId = await createCatalogProduct(parseProductInput(await request.json()));
    return NextResponse.json({ productId }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
