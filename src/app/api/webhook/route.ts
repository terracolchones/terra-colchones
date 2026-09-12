import { NextResponse, type NextRequest } from "next/server";
import { processWebhookPayload } from "@/lib/meta/handler";
import { verifySignature } from "@/lib/meta/verify";
import { diagnostic } from "@/lib/meta/diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    diagnostic({ event: "webhook.unconfigured", http_status: 503 });
    return new NextResponse("webhook no configurado", { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature, appSecret)) {
    diagnostic({ event: "webhook.signature_rejected", http_status: 401 });
    return new NextResponse("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    diagnostic({ event: "webhook.bad_json", http_status: 400 });
    return new NextResponse("bad json", { status: 400 });
  }

  // Meta necesita el 200 rápido. La deduplicación evita respuestas repetidas
  // si reintenta entregar este evento mientras el LLM sigue trabajando.
  void processWebhookPayload(payload, new URL(request.url).origin).catch(() => {
    diagnostic({ event: "webhook.processing_failed" });
  });

  diagnostic({ event: "webhook.accepted", http_status: 200 });
  return NextResponse.json({ ok: true });
}
