import { NextResponse } from "next/server";
import { getPhoneNumberInfo, isExpiredMetaAccessToken } from "@/lib/meta/client";
import type { PublicWebhookStatus } from "@/components/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUIRED_ENV = [
  "META_ACCESS_TOKEN",
  "META_PHONE_NUMBER_ID",
  "META_APP_SECRET",
  "META_VERIFY_TOKEN",
  "OPENAI_API_KEY",
] as const;

const noStore = { "Cache-Control": "no-store" };

function publicWebhookUrl(): URL | null {
  const base = process.env.PUBLIC_APP_URL?.trim();
  if (!base) return null;

  try {
    const url = new URL("/api/webhook", base);
    if (url.protocol !== "https:") return null;
    url.searchParams.set("hub.mode", "subscribe");
    // Nunca enviamos el verify token real en este diagnóstico público.
    url.searchParams.set("hub.verify_token", "healthcheck-invalid-token");
    url.searchParams.set("hub.challenge", "healthcheck");
    return url;
  } catch {
    return null;
  }
}

async function publicWebhookStatus(): Promise<PublicWebhookStatus> {
  const url = publicWebhookUrl();
  if (!url) return "not_configured";

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    return response.status === 403 && (await response.text()) === "forbidden" ? "reachable" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export async function GET() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    return NextResponse.json(
      {
        status: "missing_config",
        missing,
      },
      { headers: noStore },
    );
  }

  try {
    const [info, webhookStatus] = await Promise.all([getPhoneNumberInfo(), publicWebhookStatus()]);
    return NextResponse.json(
      {
        status: "connected",
        phone: info.display_phone_number,
        verifiedName: info.verified_name,
        quality: info.quality_rating,
        webhookStatus,
      },
      { headers: noStore },
    );
  } catch (error) {
    if (isExpiredMetaAccessToken(error)) {
      return NextResponse.json(
        {
          status: "token_expired",
          message: "El token de acceso de Meta venció y debe renovarse.",
        },
        { headers: noStore },
      );
    }

    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : String(error) },
      { headers: noStore },
    );
  }
}
