import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";

const publicCatalogOrigin = "https://terracolchonesymuebles.online";

/**
 * Barrera inicial para la interfaz de operadores. Las comprobaciones dentro de
 * cada Route Handler sensible son la segunda barrera; /api/webhook queda fuera
 * del matcher para que Meta pueda verificarlo y enviar eventos firmados.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // El servicio del agente no publica un segundo catálogo. Conservamos los
  // enlaces existentes, pero los llevamos a la única tienda pública.
  if (pathname === "/catalogo" || pathname.startsWith("/catalogo/") || pathname === "/catalogo-admin" || pathname.startsWith("/catalogo-admin/")) {
    const destination = new URL(pathname, publicCatalogOrigin);
    destination.search = search;
    return NextResponse.redirect(destination);
  }

  // Las operaciones que modifican el catálogo pertenecen exclusivamente al
  // servicio público; nunca deben ejecutarse desde el servicio del agente.
  if (pathname === "/api/catalog/admin" || pathname.startsWith("/api/catalog/admin/")) {
    return new NextResponse(null, { status: 404 });
  }

  return requireDashboardAuth(request) ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/conocimiento/:path*",
    "/catalogo/:path*",
    "/catalogo-admin/:path*",
    "/api/connection/status",
    "/api/conversations/:path*",
    "/api/messages/:path*",
    "/api/mode/:path*",
    "/api/payment-qr/:path*",
    "/api/catalog/admin/:path*",
    "/api/knowledge/:path*",
  ],
};
