import { NextResponse, type NextRequest } from "next/server";
import {
  assertBehaviorShape, authorizeBehaviorRequest, BEHAVIOR_NO_STORE, behaviorErrorResponse,
  behaviorRevision, readBehaviorInput,
} from "@/lib/behavior/api";
import { getBehaviorSnapshot, saveBehaviorDraft, validateBehaviorInstructions } from "@/lib/behavior/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const blocked = authorizeBehaviorRequest(request);
  if (blocked) return blocked;
  try {
    return NextResponse.json(getBehaviorSnapshot(), { headers: BEHAVIOR_NO_STORE });
  } catch (error) {
    return behaviorErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  const blocked = authorizeBehaviorRequest(request, true);
  if (blocked) return blocked;
  try {
    const input = await readBehaviorInput(request);
    assertBehaviorShape(input, ["instructions", "expectedRevision"]);
    return NextResponse.json(
      saveBehaviorDraft(validateBehaviorInstructions(input.instructions), behaviorRevision(input.expectedRevision)),
      { headers: BEHAVIOR_NO_STORE },
    );
  } catch (error) {
    return behaviorErrorResponse(error);
  }
}
