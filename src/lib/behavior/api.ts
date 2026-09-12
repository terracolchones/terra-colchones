import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardAuth } from "@/lib/dashboard-auth";
import { BehaviorServiceError } from "@/lib/behavior/store";

export const BEHAVIOR_NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 64 * 1024;

export function authorizeBehaviorRequest(request: NextRequest, mutation = false): NextResponse | null {
  const blocked = requireDashboardAuth(request);
  if (blocked) return blocked;
  if (mutation) {
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    let expectedOrigin: string | null = null;
    try {
      const requestUrl = new URL(request.url);
      // Next may normalize request.url's hostname (e.g. 127.0.0.1 to localhost).
      // Host is the browser's actual authority. Do not trust X-Forwarded-Host.
      const authority = request.headers.get("host") ?? requestUrl.host;
      if (authority && !/[\s\\/@?#]/.test(authority)) {
        expectedOrigin = new URL(`${requestUrl.protocol}//${authority}`).origin;
      }
    } catch {
      // Invalid authorities fail closed without exposing request headers.
    }
    if (!expectedOrigin || origin !== expectedOrigin || (fetchSite !== null && fetchSite !== "same-origin")) {
      return NextResponse.json({ error: "La operación debe realizarse desde el panel del agente." }, { status: 403, headers: BEHAVIOR_NO_STORE });
    }
  }
  return null;
}

export class BehaviorInputError extends Error {
  constructor(message: string, public readonly status: 400 | 413 | 415 = 400) {
    super(message);
    this.name = "BehaviorInputError";
  }
}

export async function readBehaviorInput(request: NextRequest): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new BehaviorInputError("Envía los datos en formato JSON.", 415);
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) throw new BehaviorInputError("El contenido es demasiado grande.", 413);
  if (!request.body) throw new BehaviorInputError("Los datos de la solicitud no son válidos.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new BehaviorInputError("El contenido es demasiado grande.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("shape");
    return value as Record<string, unknown>;
  } catch {
    throw new BehaviorInputError("Los datos de la solicitud no son válidos.");
  }
}

export function assertBehaviorShape(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new BehaviorInputError("Los campos de la solicitud no son válidos.");
  }
}

export function behaviorRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new BehaviorInputError("La revisión no es válida.");
  }
  return value;
}

export function behaviorErrorResponse(error: unknown): NextResponse {
  const known = error instanceof BehaviorServiceError || error instanceof BehaviorInputError;
  return NextResponse.json(
    { error: known ? error.message : "No se pudo completar la operación de comportamiento." },
    { status: known ? error.status : 500, headers: BEHAVIOR_NO_STORE },
  );
}
