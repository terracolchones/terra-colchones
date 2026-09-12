import { createHmac, randomBytes } from "node:crypto";

const EVENTS = [
  "webhook.unconfigured", "webhook.signature_rejected", "webhook.bad_json",
  "webhook.accepted", "webhook.processing_failed",
  "message.received", "message.duplicate_ignored", "message.channel_ignored",
  "message.mode_suppressed", "message.unsupported", "message.status",
  "send.attempt", "send.accepted", "send.rejected", "send.uncertain", "send.not_attempted", "send.failed",
  "history.persistence_failed", "catalog.session_failed", "rag.completed", "rag.failed",
] as const;
const KINDS = ["text", "image", "cta_url", "location_request_message", "interactive", "location", "unknown"] as const;
const STATUSES = ["sent", "delivered", "read", "failed", "deleted", "unknown"] as const;

export type DiagnosticEventName = typeof EVENTS[number];
export type MessageKind = typeof KINDS[number];
export type MessageStatus = typeof STATUSES[number];
export interface ClosedEvent {
  event: DiagnosticEventName;
  message_ref?: string;
  attempt_ref?: string;
  kind?: MessageKind;
  status?: MessageStatus;
  http_status?: number;
  code?: number;
  subcode?: number;
  error_codes?: readonly number[];
  elapsed_ms?: number;
}

// Never persisted or logged. Correlation intentionally expires at process
// restart and is not shared between replicas. This is pseudonymization, not a
// durable ledger or a mechanism for recovering provider IDs from the logs.
const saltKey = Symbol.for("terra.meta.diagnostic-salt");
const processState = globalThis as typeof globalThis & { [saltKey]?: Buffer };
const processSalt = processState[saltKey] ??= randomBytes(32);

export function messageRef(wamid: unknown): string | undefined {
  if (typeof wamid !== "string" || !wamid.length || wamid.length > 2048) return undefined;
  return createHmac("sha256", processSalt).update(wamid, "utf8").digest("hex").slice(0, 32);
}

function isUnsignedInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Closed, runtime-filtered schema: never serialize the caller's object. */
export function diagnostic(input: ClosedEvent): void {
  try {
    if (!input || typeof input !== "object") return;
    const event = input.event;
    if (!EVENTS.includes(event)) return;
    const safe: Record<string, unknown> = { ts: new Date().toISOString(), event };
    for (const key of ["message_ref", "attempt_ref"] as const) {
      const value = input[key];
      if (typeof value === "string" && /^[a-f0-9]{32}$/.test(value)) safe[key] = value;
    }
    const kind = input.kind;
    const status = input.status;
    const httpStatus = input.http_status;
    if (kind && KINDS.includes(kind)) safe.kind = kind;
    if (status && STATUSES.includes(status)) safe.status = status;
    if (isUnsignedInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599) {
      safe.http_status = httpStatus;
    }
    for (const key of ["code", "subcode", "elapsed_ms"] as const) {
      const value = input[key];
      if (isUnsignedInteger(value)) safe[key] = value;
    }
    const codes = input.error_codes;
    if (Array.isArray(codes)) {
      const filtered: number[] = [];
      for (let index = 0; index < Math.min(codes.length, 16); index++) {
        const value: unknown = codes[index];
        if (isUnsignedInteger(value)) filtered.push(value);
      }
      safe.error_codes = filtered;
    }
    console.info("[terra-diagnostic]", JSON.stringify(safe));
  } catch {
    // Logging failures must never turn an accepted send into a retry/fallback.
  }
}
