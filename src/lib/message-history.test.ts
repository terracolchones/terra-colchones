import { describe, expect, it } from "vitest";
import { isNearMessageEnd, mergeMessages, parseMessageCursor, whatsappContactUrl } from "@/lib/message-history";
import type { MessageView } from "@/components/types";

function message(id: number): MessageView {
  return { id, conversation_id: 1, role: "user", content: "Ejemplo ficticio", created_at: 1700000000, wa_message_id: null };
}

describe("panel history utilities", () => {
  it("does not replace an unchanged list on refresh", () => {
    const current = [message(1), message(2)];
    expect(mergeMessages(current, current.map((m) => ({ ...m })))).toBe(current);
  });
  it("keeps old pages and updates existing metadata while deduplicating and sorting", () => {
    const current = Array.from({ length: 120 }, (_, i) => message(i + 1));
    const next = mergeMessages(current, [{ ...message(120), wa_message_id: "synthetic-accepted" }, message(121)]);
    expect(next).toHaveLength(121);
    expect(next[0].id).toBe(1);
    expect(next[119].wa_message_id).toBe("synthetic-accepted");
    expect(mergeMessages([message(7)], [message(6), message(7), message(8)]).map((m) => m.id)).toEqual([6, 7, 8]);
  });
  it("distinguishes a reader in the history from one near the end", () => {
    expect(isNearMessageEnd({ scrollHeight: 2000, clientHeight: 500, scrollTop: 400 })).toBe(false);
    expect(isNearMessageEnd({ scrollHeight: 2000, clientHeight: 500, scrollTop: 1480 })).toBe(true);
  });
  it("rejects malformed, unsafe and injected cursors", () => {
    for (const cursor of ["", "-1.1", "1.-1", "1.1 OR 1=1", "1.2.3", "1.9007199254740992", "NaN.2"]) expect(parseMessageCursor(cursor)).toBeNull();
    expect(parseMessageCursor("1700000000.0")).toEqual({ createdAt: 1700000000, id: 0 });
    expect(parseMessageCursor("1700000000.12")).toEqual({ createdAt: 1700000000, id: 12 });
  });
  it("builds a contact link from a synthetic international-format number, without a message", () => {
    expect(whatsappContactUrl("+1 (202) 555-0100")).toBe("https://wa.me/12025550100");
    for (const phone of ["", "unknown", "0012025550100", "12", "123abc456789", "javascript:12345678"]) expect(whatsappContactUrl(phone)).toBeNull();
  });
});
