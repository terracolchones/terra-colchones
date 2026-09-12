import { NextResponse, type NextRequest } from "next/server";
import {
  assertBehaviorShape, authorizeBehaviorRequest, BEHAVIOR_NO_STORE, behaviorErrorResponse,
  behaviorRevision, readBehaviorInput,
} from "@/lib/behavior/api";
import { publishBehaviorDraft } from "@/lib/behavior/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const blocked = authorizeBehaviorRequest(request, true);
  if (blocked) return blocked;
  try {
    const input = await readBehaviorInput(request);
    assertBehaviorShape(input, ["expectedRevision"]);
    return NextResponse.json(publishBehaviorDraft(behaviorRevision(input.expectedRevision)), { headers: BEHAVIOR_NO_STORE });
  } catch (error) {
    return behaviorErrorResponse(error);
  }
}
