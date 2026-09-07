import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  checkQrStorage,
  isQrStorageConfigured,
  uploadPaymentQrImage,
  uploadQrPng,
} from "@/lib/supabase-qr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_QR_BYTES = 2 * 1024 * 1024;
const PNG_CONTENT_TYPE = "image/png";
const PAYMENT_CONTENT_TYPES = new Set(["image/png", "image/jpeg"]);

function authorized(request: NextRequest): boolean {
  const expected = process.env.QR_UPLOAD_TOKEN;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return expectedBytes.length === providedBytes.length && crypto.timingSafeEqual(expectedBytes, providedBytes);
}

export async function GET() {
  try {
    const storage = await checkQrStorage();
    return NextResponse.json(storage, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        configured: isQrStorageConfigured(),
        reachable: false,
        error: error instanceof Error ? error.message : "No se pudo comprobar el almacenamiento QR",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const kind = form.get("kind") || "session";
    const sessionId = form.get("sessionId");
    const file = form.get("file");

    if (kind !== "session" && kind !== "payment") {
      return NextResponse.json({ error: "kind debe ser session o payment" }, { status: 400 });
    }
    if (kind === "session" && (typeof sessionId !== "string" || !sessionId.trim())) {
      return NextResponse.json({ error: "sessionId es obligatorio" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file debe ser un archivo PNG" }, { status: 400 });
    }
    const allowedContentType = kind === "payment" ? PAYMENT_CONTENT_TYPES.has(file.type) : file.type === PNG_CONTENT_TYPE;
    if (!allowedContentType) {
      return NextResponse.json(
        { error: kind === "payment" ? "El QR de pago debe ser PNG o JPEG" : "El QR debe ser una imagen PNG" },
        { status: 415 },
      );
    }
    if (file.size === 0 || file.size > MAX_QR_BYTES) {
      return NextResponse.json({ error: "El QR debe pesar entre 1 byte y 2 MB" }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const qr = kind === "payment"
      ? await uploadPaymentQrImage(bytes, file.type)
      : await uploadQrPng(sessionId as string, bytes);
    return NextResponse.json(qr, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar el QR" },
      { status: 500 },
    );
  }
}
