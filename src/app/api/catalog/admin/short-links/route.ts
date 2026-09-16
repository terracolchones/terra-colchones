import { NextResponse, type NextRequest } from "next/server";
import { CatalogRequestError, requireCatalogAdmin } from "@/lib/catalog-storefront/admin-server";
import { createProductShortLink, listProductShortLinks, removeProductShortLink } from "@/lib/catalog-storefront/short-links-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof CatalogRequestError ? error.message : "No se pudo completar la operación. Inténtalo de nuevo." }, {
    status: error instanceof CatalogRequestError ? error.status : 500,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireCatalogAdmin(request);
    const result = await listProductShortLinks(Number(request.nextUrl.searchParams.get("page") ?? "0"));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireCatalogAdmin(request);
    await removeProductShortLink(request.nextUrl.searchParams.get("code") ?? "");
    return NextResponse.json({ removed: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireCatalogAdmin(request);
    const body = await request.text();
    if (body.length > 4096) throw new CatalogRequestError("El enlace es demasiado largo.");
    let input: unknown;
    try { input = JSON.parse(body); } catch { throw new CatalogRequestError("La solicitud no es válida."); }
    const url = input && typeof input === "object" && "url" in input ? input.url : undefined;
    const result = await createProductShortLink(url);
    return NextResponse.json(result, { status: result.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
