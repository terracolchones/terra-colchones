import { NextResponse } from "next/server";
import { getPhoneNumberInfo, isExpiredMetaAccessToken } from "@/lib/meta/client";

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
    const info = await getPhoneNumberInfo();
    return NextResponse.json(
      {
        status: "connected",
        phone: info.display_phone_number,
        verifiedName: info.verified_name,
        quality: info.quality_rating,
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
