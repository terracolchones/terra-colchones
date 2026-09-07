import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_BUCKET = "chatbot-qr";
const DEFAULT_PAYMENT_QR_PATH = "payment-qr.jpeg";
const QR_CONTENT_TYPE = "image/png";
const PAYMENT_QR_CONTENT_TYPES = new Set(["image/png", "image/jpeg"]);
const MAX_QR_BYTES = 2 * 1024 * 1024;

let client: SupabaseClient | undefined;

function requiredValue(name: "SUPABASE_URL" | "SUPABASE_SECRET_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} no está configurada`);
  return value;
}

function bucketName(): string {
  return process.env.SUPABASE_QR_BUCKET?.trim() || DEFAULT_BUCKET;
}

function objectPath(sessionId: string): string {
  const normalized = sessionId.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(normalized)) {
    throw new Error("sessionId debe tener entre 1 y 64 caracteres alfanuméricos, guiones o guiones bajos");
  }
  return `sessions/${normalized}.png`;
}

function paymentQrPath(): string {
  const path = process.env.SUPABASE_PAYMENT_QR_PATH?.trim() || DEFAULT_PAYMENT_QR_PATH;
  if (!/^[-a-zA-Z0-9_./]+\.(png|jpe?g)$/.test(path) || path.startsWith("/") || path.includes("..")) {
    throw new Error("SUPABASE_PAYMENT_QR_PATH debe ser una ruta PNG o JPEG relativa válida");
  }
  return path;
}

export function isQrStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SECRET_KEY?.trim());
}

function getClient(): SupabaseClient {
  if (client) return client;

  client = createClient(requiredValue("SUPABASE_URL"), requiredValue("SUPABASE_SECRET_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export interface UploadedQr {
  path: string;
  signedUrl: string;
  expiresIn: number;
}

/**
 * Guarda el último QR de una sesión en un bucket privado y entrega una URL breve.
 * El secreto de Supabase nunca sale del servidor.
 */
async function uploadQrImage(path: string, bytes: Buffer, contentType: string): Promise<UploadedQr> {
  if (bytes.length === 0) throw new Error("El archivo QR está vacío");
  if (bytes.length > MAX_QR_BYTES) throw new Error("El QR no puede superar 2 MB");

  const storage = getClient().storage.from(bucketName());
  const { error: uploadError } = await storage.upload(path, bytes, {
    cacheControl: "0",
    contentType,
    upsert: true,
  });
  if (uploadError) throw new Error(`No se pudo guardar el QR: ${uploadError.message}`);

  const expiresIn = 5 * 60;
  const { data, error: signedUrlError } = await storage.createSignedUrl(path, expiresIn);
  if (signedUrlError || !data?.signedUrl) {
    throw new Error(`El QR se guardó, pero no se pudo crear su enlace temporal: ${signedUrlError?.message || "sin detalle"}`);
  }

  return { path, signedUrl: data.signedUrl, expiresIn };
}

/** Guarda el último QR de una sesión en un bucket privado y entrega una URL breve. */
export async function uploadQrPng(sessionId: string, bytes: Buffer): Promise<UploadedQr> {
  return uploadQrImage(objectPath(sessionId), bytes, QR_CONTENT_TYPE);
}

/** Guarda el QR de cobro que se compartirá cuando un operador confirme un pedido. */
export async function uploadPaymentQrImage(bytes: Buffer, contentType: string): Promise<UploadedQr> {
  if (!PAYMENT_QR_CONTENT_TYPES.has(contentType)) {
    throw new Error("El QR de pago debe ser una imagen PNG o JPEG");
  }
  return uploadQrImage(paymentQrPath(), bytes, contentType);
}

export async function getPaymentQrSignedUrl(): Promise<UploadedQr> {
  const path = paymentQrPath();
  const expiresIn = 5 * 60;
  const { data, error } = await getClient().storage.from(bucketName()).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(`No se pudo obtener el QR de pago: ${error?.message || "sin detalle"}`);
  }
  return { path, signedUrl: data.signedUrl, expiresIn };
}

export async function checkQrStorage(): Promise<{ bucket: string; configured: boolean; reachable: boolean }> {
  const bucket = bucketName();
  if (!isQrStorageConfigured()) return { bucket, configured: false, reachable: false };

  const { data, error } = await getClient().storage.getBucket(bucket);
  if (error || !data) throw new Error(`No se pudo acceder al bucket ${bucket}: ${error?.message || "sin detalle"}`);
  if (data.public) throw new Error(`El bucket ${bucket} debe ser privado`);
  return { bucket, configured: true, reachable: true };
}
