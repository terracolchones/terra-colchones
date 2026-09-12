import { NextResponse, type NextRequest } from "next/server";
import {
  assertBehaviorShape, authorizeBehaviorRequest, BEHAVIOR_NO_STORE, behaviorErrorResponse,
  BehaviorInputError, readBehaviorInput,
} from "@/lib/behavior/api";
import { MAX_BEHAVIOR_INSTRUCTIONS_LENGTH } from "@/lib/behavior/types";
import {
  MAX_SIMULATION_MESSAGE_LENGTH, SIMULATION_STAGES, simulateBehavior, type SimulationStage,
} from "@/lib/behavior/simulator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const blocked = authorizeBehaviorRequest(request, true);
  if (blocked) return blocked;
  try {
    const input = await readBehaviorInput(request);
    assertBehaviorShape(input, ["instructions", "stage", "message"]);
    if (typeof input.instructions !== "string" || !input.instructions.trim()
      || input.instructions.length > MAX_BEHAVIOR_INSTRUCTIONS_LENGTH) {
      throw new BehaviorInputError("Las instrucciones deben tener entre 1 y 12.000 caracteres.");
    }
    if (typeof input.message !== "string" || !input.message.trim() || input.message.length > MAX_SIMULATION_MESSAGE_LENGTH) {
      throw new BehaviorInputError("El mensaje de prueba debe tener entre 1 y 4.096 caracteres.");
    }
    if (typeof input.stage !== "string" || !SIMULATION_STAGES.includes(input.stage as SimulationStage)) {
      throw new BehaviorInputError("Selecciona una etapa de prueba válida.");
    }
    const result = await simulateBehavior({
      instructions: input.instructions.trim(), stage: input.stage as SimulationStage, message: input.message.trim(),
    });
    return NextResponse.json(result, { headers: BEHAVIOR_NO_STORE });
  } catch (error) {
    return behaviorErrorResponse(error);
  }
}
