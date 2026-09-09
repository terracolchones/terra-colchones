import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createPublicOrderCode, normalizePublicOrderCode } from "@/lib/order-code";

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
  latest_order: CatalogOrderSummary | null;
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

export type CatalogOrderStatus =
  | "awaiting_chat_confirmation"
  | "awaiting_location"
  | "awaiting_payment"
  | "payment_proof_received"
  | "payment_confirmed";

export interface CatalogOrder {
  id: string;
  public_code: string;
  conversation_id: number | null;
  product_id: string;
  product_slug: string;
  product_name: string;
  variant_id: string | null;
  variant_label: string | null;
  price: number | null;
  status: CatalogOrderStatus;
  location_requested: number;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  location_address: string | null;
  created_at: number;
  updated_at: number;
}

export interface CatalogOrderInput {
  productId: string;
  productSlug: string;
  productName: string;
  variantId: string | null;
  variantLabel: string | null;
  price: number | null;
}

export interface CatalogOrderSummary {
  public_code: string;
  product_name: string;
  variant_label: string | null;
  status: CatalogOrderStatus;
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

  CREATE TABLE IF NOT EXISTS catalog_checkout_sessions (
    token TEXT PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_catalog_checkout_sessions_expiry
    ON catalog_checkout_sessions(expires_at);

  CREATE TABLE IF NOT EXISTS catalog_orders (
    id TEXT PRIMARY KEY,
    public_code TEXT UNIQUE NOT NULL,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    product_id TEXT NOT NULL,
    product_slug TEXT NOT NULL,
    product_name TEXT NOT NULL,
    variant_id TEXT,
    variant_label TEXT,
    price REAL,
    status TEXT CHECK(status IN ('awaiting_chat_confirmation', 'awaiting_location', 'awaiting_payment', 'payment_proof_received', 'payment_confirmed')) NOT NULL DEFAULT 'awaiting_chat_confirmation',
    location_requested INTEGER NOT NULL DEFAULT 0,
    latitude REAL,
    longitude REAL,
    location_name TEXT,
    location_address TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_catalog_orders_conversation
    ON catalog_orders(conversation_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_catalog_orders_status
    ON catalog_orders(status, created_at DESC);

  CREATE TABLE IF NOT EXISTS catalog_order_location_deliveries (
    order_id TEXT PRIMARY KEY REFERENCES catalog_orders(id) ON DELETE CASCADE,
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

function safeCatalogOrderInput(input: CatalogOrderInput): CatalogOrderInput {
  const required = [input.productId, input.productSlug, input.productName];
  if (required.some((value) => !value.trim())) throw new Error("El producto del pedido no es válido");
  return {
    productId: input.productId.trim().slice(0, 128),
    productSlug: input.productSlug.trim().slice(0, 160),
    productName: input.productName.trim().slice(0, 180),
    variantId: input.variantId?.trim().slice(0, 128) || null,
    variantLabel: input.variantLabel?.trim().slice(0, 180) || null,
    price: input.price !== null && Number.isFinite(input.price) && input.price >= 0 ? input.price : null,
  };
}

export function createCatalogCheckoutSession(conversationId: number): string {
  const db = getDatabase();
  const id = asPositiveId(conversationId);
  const token = crypto.randomBytes(24).toString("base64url");
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM catalog_checkout_sessions WHERE expires_at < unixepoch()").run();
    db.prepare(
      "INSERT INTO catalog_checkout_sessions (token, conversation_id, expires_at) VALUES (?, ?, unixepoch() + ?)",
    ).run(token, id, 24 * 60 * 60);
  });
  transaction();
  return token;
}

/** Un token solo identifica un chat temporalmente; nunca se expone el teléfono. */
export function getCheckoutSessionConversation(token: string | null | undefined): number | null {
  if (!token || !/^[A-Za-z0-9_-]{24,128}$/.test(token)) return null;
  const db = getDatabase();
  const row = db
    .prepare("SELECT conversation_id FROM catalog_checkout_sessions WHERE token = ? AND expires_at >= unixepoch()")
    .get(token) as { conversation_id: number } | undefined;
  return row?.conversation_id ?? null;
}

/** Crea un pedido sin teléfono. El chat se vincula al recibir el código corto. */
export function createCatalogOrder(input: CatalogOrderInput, conversationId?: number | null): CatalogOrder {
  const db = getDatabase();
  const safeInput = safeCatalogOrderInput(input);
  const safeConversationId = conversationId == null ? null : asPositiveId(conversationId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = crypto.randomUUID();
    const publicCode = createPublicOrderCode();
    try {
      db.prepare(
        `INSERT INTO catalog_orders (
          id, public_code, conversation_id, product_id, product_slug, product_name,
          variant_id, variant_label, price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        publicCode,
        safeConversationId,
        safeInput.productId,
        safeInput.productSlug,
        safeInput.productName,
        safeInput.variantId,
        safeInput.variantLabel,
        safeInput.price,
      );
      return getCatalogOrderById(id)!;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("catalog_orders.public_code")) throw error;
    }
  }
  throw new Error("No se pudo asignar un código de pedido único");
}

export function getCatalogOrderById(orderId: string): CatalogOrder | undefined {
  const db = getDatabase();
  return db.prepare("SELECT * FROM catalog_orders WHERE id = ?").get(orderId) as CatalogOrder | undefined;
}

export function getLatestCatalogOrderForConversation(conversationId: number): CatalogOrder | undefined {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM catalog_orders WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .get(asPositiveId(conversationId)) as CatalogOrder | undefined;
}

export function getLatestActiveCatalogOrderForConversation(conversationId: number): CatalogOrder | undefined {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM catalog_orders
       WHERE conversation_id = ? AND status IN ('awaiting_chat_confirmation', 'awaiting_location', 'awaiting_payment', 'payment_proof_received')
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(asPositiveId(conversationId)) as CatalogOrder | undefined;
}

export type CatalogOrderClaimResult = "claimed" | "already_confirmed" | "not_found" | "belongs_to_other_chat";

/** Vincula el código escrito por WhatsApp al chat que realmente lo envió. */
export function claimCatalogOrder(
  publicCode: string,
  conversationId: number,
): { result: CatalogOrderClaimResult; order: CatalogOrder | undefined } {
  const code = normalizePublicOrderCode(publicCode);
  if (!code) return { result: "not_found", order: undefined };
  const db = getDatabase();
  const transaction = db.transaction(() => {
    const id = asPositiveId(conversationId);
    const order = db.prepare("SELECT * FROM catalog_orders WHERE public_code = ?").get(code) as CatalogOrder | undefined;
    if (!order) return { result: "not_found" as const, order };
    if (order.conversation_id !== null && order.conversation_id !== id) {
      return { result: "belongs_to_other_chat" as const, order };
    }
    if (order.status !== "awaiting_chat_confirmation") {
      return { result: "already_confirmed" as const, order };
    }
    db.prepare(
      `UPDATE catalog_orders
       SET conversation_id = ?, status = 'awaiting_location', updated_at = unixepoch()
       WHERE id = ? AND status = 'awaiting_chat_confirmation'`,
    ).run(id, order.id);
    return { result: "claimed" as const, order: getCatalogOrderById(order.id) };
  });
  return transaction();
}

type CatalogLocationDeliveryStatus = "sending" | "sent" | "failed";
export type CatalogLocationReservation = "reserved" | "already_sent" | "in_progress" | "not_ready";

/** Reserva el único envío del botón GPS nativo para un pedido confirmado. */
export function reserveCatalogLocationRequest(
  orderId: string,
): { reservation: CatalogLocationReservation; order: CatalogOrder | undefined } {
  const db = getDatabase();
  const transaction = db.transaction(() => {
    const order = getCatalogOrderById(orderId);
    if (!order || order.status !== "awaiting_location" || !order.conversation_id) {
      return { reservation: "not_ready" as const, order };
    }
    if (order.location_requested === 1) return { reservation: "already_sent" as const, order };
    const existing = db
      .prepare("SELECT status, updated_at FROM catalog_order_location_deliveries WHERE order_id = ?")
      .get(orderId) as { status: CatalogLocationDeliveryStatus; updated_at: number } | undefined;
    if (existing?.status === "sent") {
      db.prepare("UPDATE catalog_orders SET location_requested = 1, updated_at = unixepoch() WHERE id = ?").run(orderId);
      return { reservation: "already_sent" as const, order: getCatalogOrderById(orderId) };
    }
    if (existing?.status === "sending" && Date.now() / 1000 - existing.updated_at < 300) {
      return { reservation: "in_progress" as const, order };
    }
    if (existing) {
      db.prepare(
        "UPDATE catalog_order_location_deliveries SET status = 'sending', attempts = attempts + 1, updated_at = unixepoch() WHERE order_id = ?",
      ).run(orderId);
    } else {
      db.prepare(
        "INSERT INTO catalog_order_location_deliveries (order_id, status, attempts) VALUES (?, 'sending', 1)",
      ).run(orderId);
    }
    return { reservation: "reserved" as const, order };
  });
  return transaction();
}

export function completeCatalogLocationRequest(orderId: string, waMessageId: string): void {
  const db = getDatabase();
  const transaction = db.transaction(() => {
    db.prepare(
      "UPDATE catalog_order_location_deliveries SET status = 'sent', wa_message_id = ?, updated_at = unixepoch() WHERE order_id = ?",
    ).run(waMessageId, orderId);
    db.prepare(
      "UPDATE catalog_orders SET location_requested = 1, updated_at = unixepoch() WHERE id = ? AND status = 'awaiting_location'",
    ).run(orderId);
  });
  transaction();
}

export function failCatalogLocationRequest(orderId: string): void {
  const db = getDatabase();
  db.prepare(
    "UPDATE catalog_order_location_deliveries SET status = 'failed', updated_at = unixepoch() WHERE order_id = ?",
  ).run(orderId);
}

export function getLocationRequestedCatalogOrderForConversation(conversationId: number): CatalogOrder | undefined {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT * FROM catalog_orders
       WHERE conversation_id = ? AND status = 'awaiting_location' AND location_requested = 1
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(asPositiveId(conversationId)) as CatalogOrder | undefined;
}

export function saveCatalogOrderLocation(
  orderId: string,
  location: { latitude: number; longitude: number; name?: string | null; address?: string | null },
): { saved: boolean; order: CatalogOrder | undefined } {
  const db = getDatabase();
  const result = db.prepare(
    `UPDATE catalog_orders
     SET latitude = ?, longitude = ?, location_name = ?, location_address = ?,
         status = 'awaiting_payment', updated_at = unixepoch()
     WHERE id = ? AND status = 'awaiting_location' AND location_requested = 1`,
  ).run(location.latitude, location.longitude, location.name ?? null, location.address ?? null, orderId);
  return { saved: result.changes > 0, order: result.changes > 0 ? getCatalogOrderById(orderId) : undefined };
}

export function markCatalogOrderPaymentProof(orderId: string): CatalogOrder | undefined {
  const db = getDatabase();
  db.prepare(
    "UPDATE catalog_orders SET status = 'payment_proof_received', updated_at = unixepoch() WHERE id = ? AND status = 'awaiting_payment'",
  ).run(orderId);
  return getCatalogOrderById(orderId);
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
  const conversations = db
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
    .all() as Array<Omit<ConversationSummary, "latest_order">>;
  return conversations.map((conversation) => {
    const order = getLatestCatalogOrderForConversation(conversation.id);
    return {
      ...conversation,
      latest_order: order
        ? {
          public_code: order.public_code,
          product_name: order.product_name,
          variant_label: order.variant_label,
          status: order.status,
        }
        : null,
    };
  });
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
