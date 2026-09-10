import "server-only";

import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_CATALOG_HOME } from "@/lib/catalog-storefront/demo";
import { normalizeColorHex } from "@/lib/catalog-storefront/color-variants";
import { CATALOG_BUCKET, catalogSchemaMissing, getCatalogServerClient, getAdminCatalogProducts, isCatalogConfigured } from "@/lib/catalog-storefront/server";
import type { CatalogHomeSettings, ProductAvailability } from "@/lib/catalog-storefront/types";

const VALID_AVAILABILITY = new Set<ProductAvailability>(["available", "out_of_stock", "coming_soon"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_PATH_PATTERN = /^products\/[0-9a-f-]{36}\/[a-zA-Z0-9_-]{1,128}\.(png|jpe?g|webp)$/;
const VARIANT_STORAGE_PATH_PATTERN = /^products\/[0-9a-f-]{36}\/variants\/[0-9a-f-]{36}\/[a-zA-Z0-9_-]{1,128}\.(png|jpe?g|webp)$/;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_GALLERY_IMAGES = 3;

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
  colorHex: string | null;
  price: number | null;
  compareAtPrice: number | null;
  availability: ProductAvailability;
  active: boolean;
  sortOrder: number;
  images: ProductImageInput[];
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
  if (rawVariants.length > 24) throw new CatalogRequestError("El producto tiene demasiadas variantes");
  if (rawImages.length > MAX_GALLERY_IMAGES) throw new CatalogRequestError("El producto puede tener como máximo 3 fotos");

  const variants = rawVariants.map((item, index) => {
    const variant = asRecord(item);
    const id = optionalText(variant.id, 36);
    if (id && !UUID_PATTERN.test(id)) throw new CatalogRequestError("El identificador de una variante no es válido");
    const rawVariantImages = Array.isArray(variant.images) ? variant.images : [];
    if (rawVariantImages.length > MAX_GALLERY_IMAGES) throw new CatalogRequestError("Una variante puede tener como máximo 3 fotos");
    const colorValue = optionalText(variant.colorHex, 7);
    const colorHex = normalizeColorHex(colorValue);
    if (colorValue && !colorHex) throw new CatalogRequestError("El color de la variante no es válido");
    const images = rawVariantImages.map((item, imageIndex) => {
      const image = asRecord(item);
      const imageId = optionalText(image.id, 36);
      const path = requiredText(image.path, "La ruta de la foto de la variante", 255);
      if (imageId && !UUID_PATTERN.test(imageId)) throw new CatalogRequestError("El identificador de una foto de variante no es válido");
      if (!VARIANT_STORAGE_PATH_PATTERN.test(path)) throw new CatalogRequestError("La foto de variante debe provenir del panel de catálogo");
      return { id: imageId, path, alt: optionalText(image.alt, 180) ?? `${name} - variante ${index + 1} - imagen ${imageIndex + 1}`, sortOrder: nonNegativeInteger(image.sortOrder, imageIndex + 1) };
    });
    return {
      id,
      externalCode: optionalText(variant.externalCode, 120),
      label: requiredText(variant.label, "El nombre de la variante", 100),
      colorHex,
      price: nonNegativePrice(variant.price),
      compareAtPrice: nonNegativePrice(variant.compareAtPrice),
      availability: productAvailability(variant.availability),
      active: variant.active !== false,
      sortOrder: nonNegativeInteger(variant.sortOrder, index + 1),
      images,
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
    color_hex: variant.colorHex,
    price: variant.price,
    compare_at_price: variant.compareAtPrice,
    availability: variant.availability,
    active: variant.active,
    sort_order: variant.sortOrder,
  }));
  if (variants.length > 0) {
    const { error } = await client.from("catalog_variants").upsert(variants);
    if (error) {
      const message = error.message || "";
      const hasVariantExtensions = input.variants.some((variant) => variant.colorHex || variant.images.length > 0);
      if (message.includes("color_hex") && hasVariantExtensions) {
        throw new CatalogRequestError("Falta activar la migración de colores y galerías de variantes", 503);
      }
      if (!message.includes("color_hex")) throw new Error(error.message);
      const legacyVariants = variants.map((variant) => ({
        id: variant.id,
        product_id: variant.product_id,
        external_code: variant.external_code,
        label: variant.label,
        price: variant.price,
        compare_at_price: variant.compare_at_price,
        availability: variant.availability,
        active: variant.active,
        sort_order: variant.sort_order,
      }));
      const { error: legacyError } = await client.from("catalog_variants").upsert(legacyVariants);
      if (legacyError) throw new Error(legacyError.message);
    }
  }
  const keptVariantIds = new Set(variants.map((variant) => variant.id));
  const removedVariantIds = (existingVariants.data ?? []).map((item) => String(item.id)).filter((id) => !keptVariantIds.has(id));
  if (removedVariantIds.length > 0) {
    const { error } = await client.from("catalog_variants").delete().in("id", removedVariantIds);
    if (error) throw new Error(error.message);
  }

  const variantImages = input.variants.flatMap((variant, index) => variant.images.map((image) => ({
    id: image.id ?? crypto.randomUUID(),
    variant_id: variants[index].id,
    storage_path: image.path,
    alt_text: image.alt,
    sort_order: image.sortOrder,
  })));
  const existingVariantIds = (existingVariants.data ?? []).map((item) => String(item.id));
  if (existingVariantIds.length > 0 || variantImages.length > 0) {
    const existingVariantImages = existingVariantIds.length > 0
      ? await client.from("catalog_variant_images").select("id").in("variant_id", existingVariantIds)
      : { data: [], error: null };
    if (existingVariantImages.error) {
      if (!catalogSchemaMissing(existingVariantImages.error) || variantImages.length > 0) throw new Error(existingVariantImages.error.message);
    } else {
      if (variantImages.length > 0) {
        const { error } = await client.from("catalog_variant_images").upsert(variantImages);
        if (error) throw new Error(error.message);
      }
      const keptVariantImageIds = new Set(variantImages.map((image) => image.id));
      const removedVariantImageIds = (existingVariantImages.data ?? []).map((item) => String(item.id)).filter((id) => !keptVariantImageIds.has(id));
      if (removedVariantImageIds.length > 0) {
        const { error } = await client.from("catalog_variant_images").delete().in("id", removedVariantImageIds);
        if (error) throw new Error(error.message);
      }
    }
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

async function uniqueProductSlug(baseSlug: string, currentProductId: string | null = null): Promise<string> {
  const client = getCatalogServerClient();
  for (let suffix = 1; suffix <= 99; suffix += 1) {
    const candidate = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
    const { data, error } = await client.from("catalog_products").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || String(data.id) === currentProductId) return candidate;
  }
  throw new CatalogRequestError("No se pudo generar una URL única para el producto");
}

export async function createCatalogProduct(input: ProductInput): Promise<string> {
  const slug = await uniqueProductSlug(input.slug);
  const { data, error } = await getCatalogServerClient().from("catalog_products").insert({
    external_code: input.externalCode,
    slug,
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
  const slug = await uniqueProductSlug(input.slug, productId);
  const { error } = await getCatalogServerClient().from("catalog_products").update({
    external_code: input.externalCode,
    slug,
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
  const { count, error: countError } = await getCatalogServerClient().from("catalog_product_images").select("id", { count: "exact", head: true }).eq("product_id", productId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= MAX_GALLERY_IMAGES) throw new CatalogRequestError("El producto ya tiene el máximo de 3 fotos");
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

export async function uploadCatalogVariantImage(productId: string, variantId: string, file: File): Promise<{ path: string; url: string }> {
  if (!UUID_PATTERN.test(productId) || !UUID_PATTERN.test(variantId)) throw new CatalogRequestError("Guarda la variante antes de subir fotos");
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new CatalogRequestError("La imagen debe pesar menos de 5 MB");
  const { data: variant, error: variantError } = await getCatalogServerClient().from("catalog_variants").select("id").eq("id", variantId).eq("product_id", productId).maybeSingle();
  if (variantError || !variant) throw new CatalogRequestError("La variante no pertenece a este producto", 404);
  const { error: schemaError } = await getCatalogServerClient().from("catalog_variant_images").select("id").eq("variant_id", variantId).limit(1);
  if (schemaError) throw new CatalogRequestError("Falta activar la migración de galerías de variantes", 503);
  const { count, error: countError } = await getCatalogServerClient().from("catalog_variant_images").select("id", { count: "exact", head: true }).eq("variant_id", variantId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= MAX_GALLERY_IMAGES) throw new CatalogRequestError("La variante ya tiene el máximo de 3 fotos");
  const { mimeType, extension } = imageMimeType(file);
  const path = `products/${productId}/variants/${variantId}/${crypto.randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await getCatalogServerClient().storage.from(CATALOG_BUCKET).upload(path, bytes, { contentType: mimeType, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  const { data } = getCatalogServerClient().storage.from(CATALOG_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function deleteCatalogProduct(productId: string): Promise<void> {
  if (!UUID_PATTERN.test(productId)) throw new CatalogRequestError("El producto no es válido", 404);
  const client = getCatalogServerClient();
  const [{ data: productImages, error: productImagesError }, { data: variants, error: variantsError }] = await Promise.all([
    client.from("catalog_product_images").select("storage_path").eq("product_id", productId),
    client.from("catalog_variants").select("id").eq("product_id", productId),
  ]);
  if (productImagesError || variantsError) throw new Error(productImagesError?.message || variantsError?.message || "No se pudo preparar la eliminación");
  const variantIds = (variants ?? []).map((variant) => String(variant.id));
  let variantPaths: string[] = [];
  if (variantIds.length > 0) {
    const { data, error } = await client.from("catalog_variant_images").select("storage_path").in("variant_id", variantIds);
    if (error && !catalogSchemaMissing(error)) throw new Error(error.message);
    variantPaths = (data ?? []).map((image) => String(image.storage_path));
  }
  const { error } = await client.from("catalog_products").delete().eq("id", productId);
  if (error) throw new Error(error.message);
  const paths = [...(productImages ?? []).map((image) => String(image.storage_path)), ...variantPaths].filter(Boolean);
  if (paths.length > 0) {
    const { error: storageError } = await client.storage.from(CATALOG_BUCKET).remove(paths);
    if (storageError) console.error("[catalog-admin] no se pudieron limpiar algunas fotos eliminadas:", storageError.message);
  }
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
  if (message.includes("catalog_products_slug_key")) {
    return NextResponse.json({ error: "Ya existe un producto con esa URL. Usa otro nombre o URL." }, { status: 409 });
  }
  console.error("[catalog-admin]", error);
  return NextResponse.json({ error: message }, { status: 500 });
}
