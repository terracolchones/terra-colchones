import "server-only";

import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_CATALOG_HOME } from "@/lib/catalog-storefront/demo";
import { CATALOG_BUCKET, getCatalogServerClient, getAdminCatalogProducts, isCatalogConfigured } from "@/lib/catalog-storefront/server";
import type { CatalogHomeSettings, ProductAvailability } from "@/lib/catalog-storefront/types";

const VALID_AVAILABILITY = new Set<ProductAvailability>(["available", "out_of_stock", "coming_soon"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_PATH_PATTERN = /^products\/[0-9a-f-]{36}\/[a-zA-Z0-9_-]{1,128}\.(png|jpe?g|webp)$/;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export class CatalogRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

function requiredAdminPassword(): string {
  const password = process.env.CATALOG_ADMIN_PASSWORD?.trim();
  if (!password) throw new CatalogRequestError("Falta configurar CATALOG_ADMIN_PASSWORD", 503);
  return password;
}

function matchesAdminPassword(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

export async function requireCatalogAdmin(request: NextRequest): Promise<void> {
  if (!isCatalogConfigured()) throw new CatalogRequestError("El catálogo no está configurado", 503);
  const password = request.headers.get("x-catalog-admin-key") ?? "";
  if (!matchesAdminPassword(password, requiredAdminPassword())) {
    throw new CatalogRequestError("Clave de administrador incorrecta", 401);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CatalogRequestError("El formato enviado no es válido");
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new CatalogRequestError("Un campo de texto tiene un formato inválido");
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new CatalogRequestError(`Un texto no puede superar ${maxLength} caracteres`);
  return normalized || null;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  const text = optionalText(value, maxLength);
  if (!text) throw new CatalogRequestError(`${field} es obligatorio`);
  return text;
}

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function productSlug(value: unknown, productName: string): string {
  const candidate = optionalText(value, 96) ?? toSlug(productName);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate)) {
    throw new CatalogRequestError("La URL del producto solo admite letras minúsculas, números y guiones");
  }
  return candidate;
}

function nonNegativePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 9_999_999) {
    throw new CatalogRequestError("El precio no es válido");
  }
  return Math.round(normalized * 100) / 100;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > 9_999) throw new CatalogRequestError("El orden no es válido");
  return normalized;
}

function productAvailability(value: unknown): ProductAvailability {
  if (typeof value !== "string" || !VALID_AVAILABILITY.has(value as ProductAvailability)) return "coming_soon";
  return value as ProductAvailability;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 16)
    .map((item) => item.slice(0, 220));
}

interface ProductVariantInput {
  id: string | null;
  externalCode: string | null;
  label: string;
  price: number | null;
  compareAtPrice: number | null;
  availability: ProductAvailability;
  active: boolean;
  sortOrder: number;
}

interface ProductImageInput {
  id: string | null;
  path: string;
  alt: string;
  sortOrder: number;
}

export interface ProductInput {
  externalCode: string | null;
  slug: string;
  name: string;
  category: string;
  shortDescription: string;
  description: string;
  specifications: string[];
  priceFrom: number | null;
  compareAtPriceFrom: number | null;
  availability: ProductAvailability;
  published: boolean;
  featured: boolean;
  sortOrder: number;
  variants: ProductVariantInput[];
  images: ProductImageInput[];
}

export function parseProductInput(payload: unknown): ProductInput {
  const value = asRecord(payload);
  const name = requiredText(value.name, "El nombre", 140);
  const rawVariants = Array.isArray(value.variants) ? value.variants : [];
  const rawImages = Array.isArray(value.images) ? value.images : [];
  if (rawVariants.length > 24 || rawImages.length > 12) throw new CatalogRequestError("El producto tiene demasiadas variantes o imágenes");

  const variants = rawVariants.map((item, index) => {
    const variant = asRecord(item);
    const id = optionalText(variant.id, 36);
    if (id && !UUID_PATTERN.test(id)) throw new CatalogRequestError("El identificador de una variante no es válido");
    return {
      id,
      externalCode: optionalText(variant.externalCode, 120),
      label: requiredText(variant.label, "El nombre de la variante", 100),
      price: nonNegativePrice(variant.price),
      compareAtPrice: nonNegativePrice(variant.compareAtPrice),
      availability: productAvailability(variant.availability),
      active: variant.active !== false,
      sortOrder: nonNegativeInteger(variant.sortOrder, index + 1),
    };
  });
  const images = rawImages.map((item, index) => {
    const image = asRecord(item);
    const id = optionalText(image.id, 36);
    const path = requiredText(image.path, "La ruta de la imagen", 255);
    if (id && !UUID_PATTERN.test(id)) throw new CatalogRequestError("El identificador de una imagen no es válido");
    if (!STORAGE_PATH_PATTERN.test(path)) throw new CatalogRequestError("La imagen debe provenir del panel de catálogo");
    return {
      id,
      path,
      alt: optionalText(image.alt, 180) ?? `${name} - imagen ${index + 1}`,
      sortOrder: nonNegativeInteger(image.sortOrder, index + 1),
    };
  });

  return {
    externalCode: optionalText(value.externalCode, 120),
    slug: productSlug(value.slug, name),
    name,
    category: requiredText(value.category, "La categoría", 80),
    shortDescription: optionalText(value.shortDescription, 280) ?? "",
    description: optionalText(value.description, 4_000) ?? "",
    specifications: stringList(value.specifications),
    priceFrom: nonNegativePrice(value.priceFrom),
    compareAtPriceFrom: nonNegativePrice(value.compareAtPriceFrom),
    availability: productAvailability(value.availability),
    published: value.published === true,
    featured: value.featured === true,
    sortOrder: nonNegativeInteger(value.sortOrder, 0),
    variants,
    images,
  };
}

async function replaceRelations(productId: string, input: ProductInput): Promise<void> {
  const client = getCatalogServerClient();
  const existingVariants = await client.from("catalog_variants").select("id").eq("product_id", productId);
  if (existingVariants.error) throw new Error(existingVariants.error.message);
  const existingImages = await client.from("catalog_product_images").select("id").eq("product_id", productId);
  if (existingImages.error) throw new Error(existingImages.error.message);

  const variants = input.variants.map((variant) => ({
    id: variant.id ?? crypto.randomUUID(),
    product_id: productId,
    external_code: variant.externalCode,
    label: variant.label,
    price: variant.price,
    compare_at_price: variant.compareAtPrice,
    availability: variant.availability,
    active: variant.active,
    sort_order: variant.sortOrder,
  }));
  if (variants.length > 0) {
    const { error } = await client.from("catalog_variants").upsert(variants);
    if (error) throw new Error(error.message);
  }
  const keptVariantIds = new Set(variants.map((variant) => variant.id));
  const removedVariantIds = (existingVariants.data ?? []).map((item) => String(item.id)).filter((id) => !keptVariantIds.has(id));
  if (removedVariantIds.length > 0) {
    const { error } = await client.from("catalog_variants").delete().in("id", removedVariantIds);
    if (error) throw new Error(error.message);
  }

  const images = input.images.map((image) => ({
    id: image.id ?? crypto.randomUUID(),
    product_id: productId,
    storage_path: image.path,
    alt_text: image.alt,
    sort_order: image.sortOrder,
  }));
  if (images.length > 0) {
    const { error } = await client.from("catalog_product_images").upsert(images);
    if (error) throw new Error(error.message);
  }
  const keptImageIds = new Set(images.map((image) => image.id));
  const removedImageIds = (existingImages.data ?? []).map((item) => String(item.id)).filter((id) => !keptImageIds.has(id));
  if (removedImageIds.length > 0) {
    const { error } = await client.from("catalog_product_images").delete().in("id", removedImageIds);
    if (error) throw new Error(error.message);
  }
}

export async function createCatalogProduct(input: ProductInput): Promise<string> {
  const { data, error } = await getCatalogServerClient().from("catalog_products").insert({
    external_code: input.externalCode,
    slug: input.slug,
    name: input.name,
    category: input.category,
    short_description: input.shortDescription,
    description: input.description,
    specifications: input.specifications,
    price_from: input.priceFrom,
    compare_at_price_from: input.compareAtPriceFrom,
    availability: input.availability,
    published: input.published,
    featured: input.featured,
    sort_order: input.sortOrder,
  }).select("id").single();
  if (error || !data?.id) throw new Error(error?.message || "No se pudo crear el producto");
  await replaceRelations(String(data.id), input);
  return String(data.id);
}

export async function updateCatalogProduct(productId: string, input: ProductInput): Promise<void> {
  if (!UUID_PATTERN.test(productId)) throw new CatalogRequestError("El producto no es válido", 404);
  const { error } = await getCatalogServerClient().from("catalog_products").update({
    external_code: input.externalCode,
    slug: input.slug,
    name: input.name,
    category: input.category,
    short_description: input.shortDescription,
    description: input.description,
    specifications: input.specifications,
    price_from: input.priceFrom,
    compare_at_price_from: input.compareAtPriceFrom,
    availability: input.availability,
    published: input.published,
    featured: input.featured,
    sort_order: input.sortOrder,
  }).eq("id", productId);
  if (error) throw new Error(error.message);
  await replaceRelations(productId, input);
}

export async function listCatalogForAdmin() {
  return getAdminCatalogProducts();
}

function imageMimeType(file: File): { mimeType: string; extension: string } {
  if (file.type === "image/png") return { mimeType: file.type, extension: "png" };
  if (file.type === "image/jpeg") return { mimeType: file.type, extension: "jpg" };
  if (file.type === "image/webp") return { mimeType: file.type, extension: "webp" };
  throw new CatalogRequestError("La imagen debe ser PNG, JPG o WEBP");
}

export async function uploadCatalogImage(productId: string, file: File): Promise<{ path: string; url: string }> {
  if (!UUID_PATTERN.test(productId)) throw new CatalogRequestError("Guarda el producto antes de subir imágenes");
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new CatalogRequestError("La imagen debe pesar menos de 5 MB");
  const { mimeType, extension } = imageMimeType(file);
  const path = `products/${productId}/${crypto.randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await getCatalogServerClient().storage.from(CATALOG_BUCKET).upload(path, bytes, {
    contentType: mimeType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = getCatalogServerClient().storage.from(CATALOG_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function getAdminHomeSettings(): Promise<CatalogHomeSettings> {
  if (!isCatalogConfigured()) return DEFAULT_CATALOG_HOME;
  const { data, error } = await getCatalogServerClient().from("catalog_home_settings").select("eyebrow, title, description, image_path").eq("id", "home").maybeSingle();
  if (error || !data) return DEFAULT_CATALOG_HOME;
  const imagePath = typeof data.image_path === "string" ? data.image_path : "";
  const { data: publicUrl } = getCatalogServerClient().storage.from(CATALOG_BUCKET).getPublicUrl(imagePath);
  return {
    eyebrow: typeof data.eyebrow === "string" ? data.eyebrow : DEFAULT_CATALOG_HOME.eyebrow,
    title: typeof data.title === "string" ? data.title : DEFAULT_CATALOG_HOME.title,
    description: typeof data.description === "string" ? data.description : DEFAULT_CATALOG_HOME.description,
    imageUrl: imagePath ? publicUrl.publicUrl : null,
  };
}

export async function saveAdminHomeSettings(payload: unknown): Promise<void> {
  const value = asRecord(payload);
  const imagePath = optionalText(value.imagePath, 255);
  if (imagePath && !STORAGE_PATH_PATTERN.test(imagePath)) throw new CatalogRequestError("La imagen de portada debe provenir del panel");
  const { error } = await getCatalogServerClient().from("catalog_home_settings").upsert({
    id: "home",
    eyebrow: requiredText(value.eyebrow, "La etiqueta", 80),
    title: requiredText(value.title, "El título", 160),
    description: requiredText(value.description, "La descripción", 320),
    image_path: imagePath,
  });
  if (error) throw new Error(error.message);
}

export function jsonError(error: unknown) {
  if (error instanceof CatalogRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "No se pudo procesar la solicitud";
  console.error("[catalog-admin]", error);
  return NextResponse.json({ error: message }, { status: 500 });
}
