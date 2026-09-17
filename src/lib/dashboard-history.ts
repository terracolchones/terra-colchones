import type { MessageView } from "@/components/types";
import { messageCursor, type MessageCursor, type MessagePage } from "@/lib/message-history";

export interface DashboardHistoryOptions {
  before?: MessageCursor;
  after?: MessageCursor;
}

interface MessagePageDatabase {
  prepare(sql: string): { all(...parameters: number[]): unknown[] };
}

/** Read-only panel query. The agent's message/context queries remain unchanged. */
export function readDashboardMessagePage(
  database: MessagePageDatabase,
  conversationId: number,
  options: DashboardHistoryOptions = {},
): MessagePage {
  if (options.before && options.after) throw new Error("Usa un solo cursor de historial.");
  const cursor = options.before ?? options.after;
  const operator = options.after ? ">" : "<";
  const direction = options.after ? "ASC" : "DESC";
  const values = cursor ? [conversationId, cursor.createdAt, cursor.createdAt, cursor.id] : [conversationId];
  const rows = database.prepare(`
    SELECT id, conversation_id, role, content, wa_message_id, created_at FROM messages
    WHERE conversation_id = ?
    ${cursor ? `AND (created_at ${operator} ? OR (created_at = ? AND id ${operator} ?))` : ""}
    ORDER BY created_at ${direction}, id ${direction} LIMIT 51
  `).all(...values) as MessageView[];
  const hasMore = rows.length > 50;
  const messages = rows.slice(0, 50);
  const nextCursor = hasMore ? messageCursor(messages[messages.length - 1]) : null;
  if (!options.after) messages.reverse();
  return { messages, hasMore, nextCursor };
}
