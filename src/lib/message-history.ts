import type { MessageView } from "@/components/types";

export interface MessageCursor { createdAt: number; id: number }
export interface MessagePage {
  messages: MessageView[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function messageCursor(message: Pick<MessageView, "created_at" | "id">): string {
  return `${message.created_at}.${message.id}`;
}

export function parseMessageCursor(value: string): MessageCursor | null {
  if (!/^\d{1,16}\.\d{1,16}$/.test(value)) return null;
  const [createdAt, id] = value.split(".").map(Number);
  return Number.isSafeInteger(createdAt) && Number.isSafeInteger(id) ? { createdAt, id } : null;
}

export function compareMessages(left: Pick<MessageView, "created_at" | "id">, right: Pick<MessageView, "created_at" | "id">): number {
  return left.created_at - right.created_at || left.id - right.id;
}

/** Preserve loaded history and update delivery metadata without duplicating rows. */
export function mergeMessages(current: MessageView[], received: MessageView[]): MessageView[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  let changed = false;
  for (const message of received) {
    const previous = byId.get(message.id);
    if (!previous || previous.content !== message.content || previous.role !== message.role ||
      previous.wa_message_id !== message.wa_message_id || previous.created_at !== message.created_at) {
      byId.set(message.id, message);
      changed = true;
    }
  }
  return changed ? [...byId.values()].sort(compareMessages) : current;
}

export function isNearMessageEnd(element: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 64;
}

export function whatsappContactUrl(phone: string): string | null {
  // Accept display separators, never guess a country code or strip arbitrary text.
  if (!/^\+?[\d\s()-]+$/.test(phone.trim())) return null;
  const digits = phone.replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? `https://wa.me/${digits}` : null;
}
