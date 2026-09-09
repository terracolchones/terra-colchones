import crypto from "node:crypto";

const ORDER_CODE_PART = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ORDER_CODE_PATTERN = /^T-([A-Z0-9]{4})-([A-Z0-9]{4})$/;

export function createPublicOrderCode(): string {
  const bytes = crypto.randomBytes(8);
  const characters = Array.from(bytes, (byte) => ORDER_CODE_PART[byte % ORDER_CODE_PART.length]).join("");
  return `T-${characters.slice(0, 4)}-${characters.slice(4, 8)}`;
}

export function normalizePublicOrderCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return ORDER_CODE_PATTERN.test(normalized) ? normalized : null;
}

/** Reconoce el mensaje corto que abre WhatsApp desde el catálogo. */
export function parseOrderConfirmationCode(content: string): string | null {
  const match = /(?:^|\s|#)(T-[A-Z0-9]{4}-[A-Z0-9]{4})(?:\b|$)/i.exec(content);
  return match ? normalizePublicOrderCode(match[1]) : null;
}
