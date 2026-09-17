import type { CatalogOrderStatus } from "@/components/types";

export type AssetState = "pending" | "ready" | "failed";
export type SendState = "preparing" | "sending" | "sent" | "uncertain" | "failed";
export interface MessageAsset {
  id: string;
  kind: "image" | "document" | "location";
  filename: string;
  mime: string;
  caption: string;
  state: AssetState;
  url: string | null;
  latitude: number | null;
  longitude: number | null;
  sendState?: SendState;
}
export interface OrderDetails {
  publicCode: string;
  productName: string;
  variantLabel: string | null;
  price: number | null;
  status: CatalogOrderStatus;
  customerName: string | null;
  location: { latitude: number; longitude: number; address: string | null } | null;
  attachments: MessageAsset[];
  commerce: { provider: "terra" | "shopify"; adminUrl: string | null };
}

export function locationUrl(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

export function shopifyAdminUrl(store: string, resource: string): string | null {
  const domain = store.match(/^([a-z0-9][a-z0-9-]*)\.myshopify\.com$/);
  const id = resource.match(/^gid:\/\/shopify\/(DraftOrder|Order)\/([1-9]\d*)$/);
  return domain && id ? `https://admin.shopify.com/store/${domain[1]}/${id[1] === "DraftOrder" ? "draft_orders" : "orders"}/${id[2]}` : null;
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"] as const;
export function validateFile(bytes: Uint8Array, mime: string): void {
  if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) throw new Error("El archivo debe tener entre 1 byte y 5 MB.");
  const valid = mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
    mime === "image/png" ? [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v) :
    mime === "application/pdf" && [37,80,68,70,45].every((v, i) => bytes[i] === v);
  if (!valid) throw new Error("Solo se admiten imágenes JPG/PNG y documentos PDF válidos.");
}
export function safeFilename(value: string, mime: string): string {
  const ext = mime === "image/png" ? ".png" : mime === "image/jpeg" ? ".jpg" : ".pdf";
  const name = value.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 70);
  return `${name || "archivo"}${ext}`;
}
