import { NextResponse, type NextRequest } from "next/server";
import { jsonError, requireCatalogAdmin, uploadCatalogImage } from "@/lib/catalog-storefront/admin-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireCatalogAdmin(request);
    const form = await request.formData();
    const productId = form.get("productId");
    const file = form.get("file");
    if (typeof productId !== "string" || !(file instanceof File)) {
      return NextResponse.json({ error: "Selecciona una imagen y un producto" }, { status: 400 });
    }
    return NextResponse.json(await uploadCatalogImage(productId, file), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
