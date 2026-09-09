import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type ConversationMode = "AI" | "HUMAN";
export type MessageRole = "user" | "assistant" | "human";

export interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: ConversationMode;
  last_message_at: number | null;
  created_at: number;
}

export interface ConversationSummary extends Conversation {
  last_message_preview: string | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  wa_message_id: string | null;
  created_at: number;
}

export interface CatalogLeadContext {
  productId: string;
  variantId: string | null;
}

type PaymentQrDeliveryStatus = "sending" | "sent" | "failed";

const dataDirectory = path.join(process.cwd(), "data");
let database: Database.Database | undefined;

/**
 * No abrimos SQLite al importar el módulo: Next importa las rutas en paralelo
 * durante el build. Abrirlo solo al atender una request evita competir por WAL.
 */
function getDatabase(): Database.Database {
  if (database) return database;

  fs.mkdirSync(dataDirectory, { recursive: true });
  const instance = new Database(path.join(dataDirectory, "messages.db"));
  instance.pragma("busy_timeout = 5000");
  try {
    instance.pragma("journal_mode = WAL");
  } catch (error) {
    // Otro worker puede estar activando WAL en este instante. Con WAL ya activo
    // no hace falta repetir la operación para usar la misma base.
    if (!(error instanceof Error) || !error.message.includes("database is locked")) throw error;
  }
  instance.pragma("foreign_keys = ON");
  instance.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    mode TEXT CHECK(mode IN ('AI', 'HUMAN')) NOT NULL DEFAULT 'AI',
    last_message_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    role TEXT CHECK(role IN ('user', 'assistant', 'human')) NOT NULL,
    content TEXT NOT NULL,
    wa_message_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv
    ON messages(conversation_id, created_at);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_id
    ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS processed_webhook_messages (
    wa_message_id TEXT PRIMARY KEY,
    processed_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS conversation_catalog_context (
    conversation_id INTEGER PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    variant_id TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS payment_qr_deliveries (
    order_id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    status TEXT CHECK(status IN ('sending', 'sent', 'failed')) NOT NULL,
    wa_message_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

`);
  database = instance;
  return instance;
}

export type PaymentQrReservation = "reserved" | "already_sent" | "in_progress";

export function reservePaymentQrDelivery(orderId: string, phone: string): PaymentQrReservation {
  const db = getDatabase();
  const transaction = db.transaction(() => {
    const existing = db
      .prepare("SELECT status, updated_at FROM payment_qr_deliveries WHERE order_id = ?")
      .get(orderId) as { status: PaymentQrDeliveryStatus; updated_at: number } | undefined;

    if (!existing) {
      db.prepare(
        "INSERT INTO payment_qr_deliveries (order_id, phone, status, attempts) VALUES (?, ?, 'sending', 1)",
      ).run(orderId, phone);
      return "reserved" as const;
    }
    if (existing.status === "sent") return "already_sent" as const;
    if (existing.status === "sending" && Date.now() / 1000 - existing.updated_at < 300) {
      return "in_progress" as const;
    }

    db.prepare(
      "UPDATE payment_qr_deliveries SET phone = ?, status = 'sending', attempts = attempts + 1, updated_at = unixepoch() WHERE order_id = ?",
    ).run(phone, orderId);
    return "reserved" as const;
  });
  return transaction();
}

export function completePaymentQrDelivery(orderId: string, waMessageId: string): void {
  const db = getDatabase();
  db.prepare(
    "UPDATE payment_qr_deliveries SET status = 'sent', wa_message_id = ?, updated_at = unixepoch() WHERE order_id = ?",
  ).run(waMessageId, orderId);
}

export function failPaymentQrDelivery(orderId: string): void {
  const db = getDatabase();
  db.prepare(
    "UPDATE payment_qr_deliveries SET status = 'failed', updated_at = unixepoch() WHERE order_id = ?",
  ).run(orderId);
}

function asPositiveId(id: number): number {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("El id de conversación no es válido");
  }
  return id;
}

export function getOrCreateConversation(
  phone: string,
  name?: string | null,
): Conversation {
  if (!phone.trim()) throw new Error("El teléfono no puede estar vacío");
  const db = getDatabase();

  const transaction = db.transaction(() => {
    const existing = db
      .prepare("SELECT * FROM conversations WHERE phone = ?")
      .get(phone) as Conversation | undefined;

    if (existing) {
      if (name?.trim() && name !== existing.name) {
        db.prepare("UPDATE conversations SET name = ? WHERE id = ?").run(name.trim(), existing.id);
        return getConversationById(existing.id)!;
      }
      return existing;
    }

    const result = db
      .prepare("INSERT INTO conversations (phone, name) VALUES (?, ?)")
      .run(phone, name?.trim() || null);
    return getConversationById(Number(result.lastInsertRowid))!;
  });

  return transaction();
}

export function getConversationById(id: number): Conversation | undefined {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(asPositiveId(id)) as Conversation | undefined;
}

export function insertMessage(
  conversationId: number,
  role: MessageRole,
  content: string,
  waMessageId?: string | null,
): number {
  if (!content.trim()) throw new Error("El mensaje no puede estar vacío");
  const db = getDatabase();

  const transaction = db.transaction(() => {
    const id = asPositiveId(conversationId);
    const result = db
      .prepare(
        "INSERT INTO messages (conversation_id, role, content, wa_message_id) VALUES (?, ?, ?, ?)",
      )
      .run(id, role, content.trim(), waMessageId ?? null);
    db.prepare("UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?").run(id);
    return Number(result.lastInsertRowid);
  });

  return transaction();
}

export function updateMessageWaId(messageId: number, waMessageId: string): void {
  if (!Number.isInteger(messageId) || messageId <= 0) {
    throw new Error("El id de mensaje no es válido");
  }
  const db = getDatabase();
  db.prepare("UPDATE messages SET wa_message_id = ? WHERE id = ?").run(waMessageId, messageId);
}

export function getMessages(conversationId: number, limit = 50): Message[] {
  const db = getDatabase();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
  return db
    .prepare(
      `SELECT * FROM (
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      ) ORDER BY created_at ASC, id ASC`,
    )
    .all(asPositiveId(conversationId), safeLimit) as Message[];
}

export function getRecentHistory(conversationId: number, limit = 20): Message[] {
  const db = getDatabase();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const recent = db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    )
    .all(asPositiveId(conversationId), safeLimit) as Message[];
  return recent.reverse();
}

/** Guarda el último producto abierto desde el catálogo para conservar contexto RAG. */
export function setCatalogLeadContext(
  conversationId: number,
  productId: string,
  variantId: string | null,
): void {
  if (!productId.trim()) throw new Error("El producto del catálogo no es válido");
  const db = getDatabase();
  db.prepare(
    `INSERT INTO conversation_catalog_context (conversation_id, product_id, variant_id)
     VALUES (?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       product_id = excluded.product_id,
       variant_id = excluded.variant_id,
       updated_at = unixepoch()`,
  ).run(asPositiveId(conversationId), productId, variantId);
}

export function getCatalogLeadContext(conversationId: number): CatalogLeadContext | null {
  const db = getDatabase();
  const row = db
    .prepare("SELECT product_id, variant_id FROM conversation_catalog_context WHERE conversation_id = ?")
    .get(asPositiveId(conversationId)) as { product_id: string; variant_id: string | null } | undefined;
  return row ? { productId: row.product_id, variantId: row.variant_id } : null;
}

export function setMode(conversationId: number, mode: ConversationMode): Conversation | undefined {
  const db = getDatabase();
  const id = asPositiveId(conversationId);
  db.prepare("UPDATE conversations SET mode = ? WHERE id = ?").run(mode, id);
  return getConversationById(id);
}

export function listConversations(): ConversationSummary[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT
        c.*,
        (
          SELECT m.content
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT 1
        ) AS last_message_preview
      FROM conversations c
      ORDER BY c.last_message_at IS NULL ASC, c.last_message_at DESC, c.id DESC`,
    )
    .all() as ConversationSummary[];
}

export function deleteConversation(id: number): boolean {
  const db = getDatabase();
  const transaction = db.transaction(() => {
    const conversationId = asPositiveId(id);
    db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(conversationId);
    return db.prepare("DELETE FROM conversations WHERE id = ?").run(conversationId).changes > 0;
  });
  return transaction();
}

export function wasMessageProcessed(waMessageId: string): boolean {
  const db = getDatabase();
  return Boolean(
    db.prepare("SELECT 1 FROM processed_webhook_messages WHERE wa_message_id = ?").get(waMessageId),
  );
}

/** Devuelve false si otro proceso ya reservó este mensaje. */
export function markMessageProcessed(waMessageId: string): boolean {
  const db = getDatabase();
  return (
    db.prepare("INSERT OR IGNORE INTO processed_webhook_messages (wa_message_id) VALUES (?)").run(
      waMessageId,
    ).changes > 0
  );
}
