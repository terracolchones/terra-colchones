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

export type OrderStatus =
  | "draft"
  | "awaiting_location"
  | "awaiting_payment"
  | "payment_proof_received"
  | "payment_confirmed";

export interface Order {
  id: string;
  conversation_id: number;
  product_slug: string;
  product_name: string;
  color: string | null;
  status: OrderStatus;
  /** Solo se activa cuando el bot ya envió la solicitud GPS nativa. */
  location_requested: number;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  location_address: string | null;
  created_at: number;
  updated_at: number;
}

type PaymentQrDeliveryStatus = "sending" | "sent" | "failed";
type LocationRequestDeliveryStatus = "sending" | "sent" | "failed";

const dataDirectory = path.join(process.cwd(), "data");
let database: Database.Database | undefined;

/**
 * No abrimos SQLite al importar el módulo: Next importa las rutas en paralelo
 * durante el build. Abrirlo solo al atender una request evita competir por WAL.
 */
function getDatabase(): Database.Database {
  if (database) {
    ensureOrderMigrations(database);
    return database;
  }

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

  CREATE TABLE IF NOT EXISTS payment_qr_deliveries (
    order_id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    status TEXT CHECK(status IN ('sending', 'sent', 'failed')) NOT NULL,
    wa_message_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    product_slug TEXT NOT NULL,
    product_name TEXT NOT NULL,
    color TEXT,
    status TEXT CHECK(status IN ('draft', 'awaiting_location', 'awaiting_payment', 'payment_proof_received', 'payment_confirmed')) NOT NULL DEFAULT 'draft',
    location_requested INTEGER NOT NULL DEFAULT 0,
    latitude REAL,
    longitude REAL,
    location_name TEXT,
    location_address TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_orders_conversation
    ON orders(conversation_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS location_request_deliveries (
    order_id TEXT PRIMARY KEY REFERENCES orders(id),
    status TEXT CHECK(status IN ('sending', 'sent', 'failed')) NOT NULL,
    wa_message_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);
  ensureOrderMigrations(instance);
  database = instance;
  return instance;
}

/** Mantiene funcionando las bases creadas antes del flujo de dos pasos. */
function ensureOrderMigrations(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(orders)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "location_requested")) {
    db.exec("ALTER TABLE orders ADD COLUMN location_requested INTEGER NOT NULL DEFAULT 0");
  }
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

export type LocationRequestReservation = "reserved" | "already_sent" | "in_progress" | "not_ready";

/**
 * Reserva de forma atómica el único envío del botón nativo de ubicación.
 * El pedido no acepta GPS hasta que `completeLocationRequestDelivery` termina.
 */
export function reserveLocationRequestDelivery(
  orderId: string,
): { reservation: LocationRequestReservation; order: Order | undefined } {
  const db = getDatabase();
  const transaction = db.transaction(() => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as Order | undefined;
    if (!order || order.status !== "awaiting_location") {
      return { reservation: "not_ready" as const, order };
    }
    if (order.location_requested === 1) {
      return { reservation: "already_sent" as const, order };
    }

    const existing = db
      .prepare("SELECT status, updated_at FROM location_request_deliveries WHERE order_id = ?")
      .get(orderId) as { status: LocationRequestDeliveryStatus; updated_at: number } | undefined;

    if (existing?.status === "sent") {
      db.prepare(
        "UPDATE orders SET location_requested = 1, updated_at = unixepoch() WHERE id = ? AND status = 'awaiting_location'",
      ).run(orderId);
      return { reservation: "already_sent" as const, order: getOrderById(orderId) };
    }
    if (existing?.status === "sending" && Date.now() / 1000 - existing.updated_at < 300) {
      return { reservation: "in_progress" as const, order };
    }

    if (existing) {
      db.prepare(
        "UPDATE location_request_deliveries SET status = 'sending', attempts = attempts + 1, updated_at = unixepoch() WHERE order_id = ?",
      ).run(orderId);
    } else {
      db.prepare(
        "INSERT INTO location_request_deliveries (order_id, status, attempts) VALUES (?, 'sending', 1)",
      ).run(orderId);
    }
    return { reservation: "reserved" as const, order };
  });
  return transaction();
}

export function completeLocationRequestDelivery(orderId: string, waMessageId: string): void {
  const db = getDatabase();
  const transaction = db.transaction(() => {
    db.prepare(
      "UPDATE location_request_deliveries SET status = 'sent', wa_message_id = ?, updated_at = unixepoch() WHERE order_id = ?",
    ).run(waMessageId, orderId);
    db.prepare(
      "UPDATE orders SET location_requested = 1, updated_at = unixepoch() WHERE id = ? AND status = 'awaiting_location'",
    ).run(orderId);
  });
  transaction();
}

export function failLocationRequestDelivery(orderId: string): void {
  const db = getDatabase();
  db.prepare(
    "UPDATE location_request_deliveries SET status = 'failed', updated_at = unixepoch() WHERE order_id = ?",
  ).run(orderId);
}

function orderIdentifier(): string {
  return `TERRA-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

export function createDraftOrder(
  conversationId: number,
  product: { slug: string; name: string },
): Order {
  const db = getDatabase();
  const id = orderIdentifier();
  db.prepare(
    "INSERT INTO orders (id, conversation_id, product_slug, product_name) VALUES (?, ?, ?, ?)",
  ).run(id, asPositiveId(conversationId), product.slug, product.name);
  return getOrderById(id)!;
}

export function getOrderById(orderId: string): Order | undefined {
  const db = getDatabase();
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as Order | undefined;
}

/** Confirma una selección heredada de la landing. El id impredecible vincula el pedido al chat correcto. */
export function confirmOrderFromLanding(orderId: string, color: string): Order | undefined {
  const db = getDatabase();
  const result = db.prepare(
    "UPDATE orders SET color = ?, status = 'awaiting_location', updated_at = unixepoch() WHERE id = ? AND status = 'draft'",
  ).run(color, orderId);
  if (result.changes === 0) return getOrderById(orderId);
  return getOrderById(orderId);
}

/** Guarda un color elegido desde un botón nativo sin adelantar el paso de confirmación. */
export function selectOrderColor(
  orderId: string,
  conversationId: number,
  color: string,
): Order | undefined {
  const db = getDatabase();
  const result = db.prepare(
    `UPDATE orders
     SET color = ?, updated_at = unixepoch()
     WHERE id = ? AND conversation_id = ? AND status = 'draft'`,
  ).run(color, orderId, asPositiveId(conversationId));
  return result.changes > 0 ? getOrderById(orderId) : undefined;
}

export function getLatestOrderForConversation(
  conversationId: number,
  statuses?: OrderStatus[],
): Order | undefined {
  const db = getDatabase();
  const id = asPositiveId(conversationId);
  if (!statuses?.length) {
    return db.prepare("SELECT * FROM orders WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(id) as Order | undefined;
  }
  const placeholders = statuses.map(() => "?").join(", ");
  return db.prepare(
    `SELECT * FROM orders WHERE conversation_id = ? AND status IN (${placeholders}) ORDER BY created_at DESC, rowid DESC LIMIT 1`,
  ).get(id, ...statuses) as Order | undefined;
}

/** Devuelve solo pedidos cuyo botón GPS ya fue enviado por el flujo controlado. */
export function getLatestLocationRequestedOrderForConversation(conversationId: number): Order | undefined {
  const db = getDatabase();
  return db.prepare(
    `SELECT * FROM orders
     WHERE conversation_id = ? AND status = 'awaiting_location' AND location_requested = 1
     ORDER BY created_at DESC, rowid DESC LIMIT 1`,
  ).get(asPositiveId(conversationId)) as Order | undefined;
}

export function getOrderForConversation(orderId: string, conversationId: number): Order | undefined {
  const db = getDatabase();
  return db.prepare("SELECT * FROM orders WHERE id = ? AND conversation_id = ?").get(orderId, asPositiveId(conversationId)) as Order | undefined;
}

export function saveOrderLocation(
  orderId: string,
  location: { latitude: number; longitude: number; name?: string | null; address?: string | null },
): { saved: boolean; order: Order | undefined } {
  const db = getDatabase();
  const result = db.prepare(
    `UPDATE orders
     SET latitude = ?, longitude = ?, location_name = ?, location_address = ?, status = 'awaiting_payment', updated_at = unixepoch()
     WHERE id = ? AND status = 'awaiting_location' AND location_requested = 1`,
  ).run(location.latitude, location.longitude, location.name ?? null, location.address ?? null, orderId);
  return { saved: result.changes > 0, order: result.changes > 0 ? getOrderById(orderId) : undefined };
}

export function markOrderPaymentProof(orderId: string): Order | undefined {
  const db = getDatabase();
  db.prepare(
    "UPDATE orders SET status = 'payment_proof_received', updated_at = unixepoch() WHERE id = ? AND status = 'awaiting_payment'",
  ).run(orderId);
  return getOrderById(orderId);
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
