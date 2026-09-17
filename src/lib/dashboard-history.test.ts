import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { readDashboardMessagePage } from "@/lib/dashboard-history";
import { parseMessageCursor } from "@/lib/message-history";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE messages (id INTEGER PRIMARY KEY, conversation_id INTEGER, role TEXT, content TEXT, wa_message_id TEXT, created_at INTEGER)");
  const add = db.prepare("INSERT INTO messages VALUES (?, ?, 'user', 'Mensaje sintético', NULL, ?)");
  for (let id = 1; id <= 137; id++) add.run(id, 1, 1700000000 + Math.floor(id / 7));
  add.run(138, 2, 1900000000);
  return { db, add };
}

describe("read-only dashboard pagination", () => {
  it("walks every historical page, including tied timestamps, without duplicates or another conversation", () => {
    const { db } = fixture();
    try {
      let page = readDashboardMessagePage(db, 1);
      expect(page.messages.map((m) => m.id)).toEqual(Array.from({ length: 50 }, (_, i) => i + 88));
      const ids = page.messages.map((m) => m.id);
      while (page.hasMore) {
        page = readDashboardMessagePage(db, 1, { before: parseMessageCursor(page.nextCursor!)! });
        ids.unshift(...page.messages.map((m) => m.id));
      }
      expect(ids).toEqual(Array.from({ length: 137 }, (_, i) => i + 1));
      expect(page.nextCursor).toBeNull();
      expect(db.prepare("SELECT COUNT(*) AS n FROM messages").get()?.n).toBe(138);
    } finally { db.close(); }
  });

  it("catches up on more than 50 incoming messages while history remains pageable", () => {
    const { db, add } = fixture();
    try {
      const first = readDashboardMessagePage(db, 1);
      for (let id = 139; id <= 260; id++) add.run(id, 1, 1800000000);
      let page = readDashboardMessagePage(db, 1, { after: { createdAt: first.messages.at(-1)!.created_at, id: 137 } });
      const received = [...page.messages];
      while (page.hasMore) {
        page = readDashboardMessagePage(db, 1, { after: parseMessageCursor(page.nextCursor!)! });
        received.push(...page.messages);
      }
      expect(received.map((m) => m.id)).toEqual(Array.from({ length: 122 }, (_, i) => i + 139));
      const older = readDashboardMessagePage(db, 1, { before: parseMessageCursor(first.nextCursor!)! });
      expect(older.messages.at(-1)?.id).toBe(87);
    } finally { db.close(); }
  });

  it("returns an empty page for an empty conversation and rejects competing cursors", () => {
    const { db } = fixture();
    try {
      expect(readDashboardMessagePage(db, 999)).toEqual({ messages: [], hasMore: false, nextCursor: null });
      expect(() => readDashboardMessagePage(db, 1, { before: { id: 10, createdAt: 10 }, after: { id: 5, createdAt: 5 } })).toThrow();
    } finally { db.close(); }
  });
});
