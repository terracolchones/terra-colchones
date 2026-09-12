import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  const expected = process.env.ORDER_CONFIRMATION_TOKEN;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return expectedBytes.length === providedBytes.length && crypto.timingSafeEqual(expectedBytes, providedBytes);
}

/** Retired: modern catalog orders are confirmed by the customer's signed webhook. */
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers });
  // Do not parse customer data, open SQLite, release old reservations or send QR.
  // Keep historical tables intact; a stale caller gets an explicit terminal result.
  return NextResponse.json(
    { error: "Esta integración fue retirada. Usa el flujo de pedidos del catálogo y la confirmación del cliente por WhatsApp." },
    { status: 410, headers },
  );
}
