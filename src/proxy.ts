import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";

/**
 * Barrera inicial para la interfaz de operadores. Las comprobaciones dentro de
 * cada Route Handler sensible son la segunda barrera; /api/webhook queda fuera
 * del matcher para que Meta pueda verificarlo y enviar eventos firmados.
 */
export function proxy(request: NextRequest) {
  return requireDashboardAuth(request) ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/catalogo-admin/:path*",
    "/api/connection/status",
    "/api/conversations/:path*",
    "/api/messages/:path*",
    "/api/mode/:path*",
    "/api/payment-qr/:path*",
    "/api/catalog/admin/:path*",
  ],
};
