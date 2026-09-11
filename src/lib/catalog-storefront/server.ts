import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_CATALOG_HOME,
  DEVELOPMENT_CATALOG_PREVIEW,
} from "@/lib/catalog-storefront/demo";
import { normalizeColorHex } from "@/lib/catalog-storefront/color-variants";
import { normalizeWhatsAppPhone } from "@/lib/catalog-storefront/whatsapp";
import { getPhoneNumberInfo } from "@/lib/meta/client";
import type {
  CatalogHomeSettings,
  CatalogImage,
  CatalogProduct,
  CatalogSnapshot,
  CatalogVariant,
  ProductAvailability,
} from "@/lib/catalog-storefront/types";

const CATALOG_BUCKET = "catalog-images";
const VALID_AVAILABILITY = new Set<ProductAvailability>([
  "available",
  "out_of_stock",
  "coming_soon",
]);
// Último recurso para no desactivar la compra si Graph o las variables de Meta
// no están disponibles durante el renderizado del catálogo.
const DEFAULT_CATALOG_WHATSAPP_PHONE = "59178600064";

let client: SupabaseClient | undefined;

function configuredSupabaseUrl(): string {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url)
    throw new Error("Falta configurar SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL");
  return url;
}

function configuredSupabaseSecret(): string {
  const secret =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret)
    throw new Error(
      "Falta configurar SUPABASE_SECRET_KEY o SUPABASE_SERVICE_ROLE_KEY",
    );
  return secret;
}

export function isCatalogConfigured(): boolean {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(url && secret);
}

/**
 * El catálogo debe abrir el mismo número que usa la Cloud API. La variable
 * privada solo sirve de respaldo cuando Graph no puede consultarse (por
 * ejemplo, si el catálogo se despliega sin las credenciales de Meta).
 */
function configuredCatalogWhatsAppPhone(): string | null {
  return (
    normalizeWhatsAppPhone(process.env.TERRA_WHATSAPP_PHONE) ??
    normalizeWhatsAppPhone(process.env.NEXT_PUBLIC_TERRA_WHATSAPP_PHONE) ??
    DEFAULT_CATALOG_WHATSAPP_PHONE
  );
}

export async function getCatalogWhatsAppPhone(): Promise<string | null> {
  const fallback = configuredCatalogWhatsAppPhone();

  try {
    const phone = normalizeWhatsAppPhone(
      (await getPhoneNumberInfo()).display_phone_number,
    );
    if (!phone) {
      console.warn(
        "[catalog] Meta no devolvió un número de WhatsApp válido; se usa el respaldo configurado.",
      );
      return fallback;
    }
    if (fallback && fallback !== phone) {
      console.warn(
        "[catalog] El número configurado no coincide con el número activo de Meta; se usa el de Meta.",
      );
    }
    return phone;
  } catch {
    console.warn(
      "[catalog] No se pudo consultar el número activo de Meta; se usa el respaldo configurado.",
    );
    return fallback;
  }
}

export function getCatalogServerClient(): SupabaseClient {
  if (client) return client;

  client = createClient(configuredSupabaseUrl(), configuredSupabaseSecret(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

function availability(value: unknown): ProductAvailability {
  return typeof value === "string" &&
    VALID_AVAILABILITY.has(value as ProductAvailability)
    ? (value as ProductAvailability)
    : "coming_soon";
}

function price(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function publicImageUrl(path: string): string {
  if (!path || !isCatalogConfigured()) return "";
  return getCatalogServerClient()
    .storage.from(CATALOG_BUCKET)
    .getPublicUrl(path).data.publicUrl;
}

function catalogErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return String(error);
}

export function catalogSchemaMissing(error: unknown): boolean {
  const message = catalogErrorMessage(error);
  return (
    message.includes("Could not find the table") ||
    message.includes('relation "catalog_')
  );
}

function catalogVariantExtensionsMissing(error: unknown): boolean {
  const message = catalogErrorMessage(error);
  return (
    catalogSchemaMissing(error) ||
    [
      "color_hex",
      "color_name",
      "show_color",
      "show_option_text",
      "is_primary",
      "catalog_variant_images",
      "catalog_variants.slug",
      "'slug' column of 'catalog_variants'",
      "column of 'catalog_variants'",
      "column of catalog_variants",
    ].some((field) => message.includes(field))
  );
}

function toImage(row: Record<string, unknown>): CatalogImage {
  const path = typeof row.storage_path === "string" ? row.storage_path : "";
  return {
    id: String(row.id),
    path,
    url: publicImageUrl(path),
    alt:
      typeof row.alt_text === "string"
        ? row.alt_text
        : "Imagen del producto Terra",
    sortOrder: Number(row.sort_order) || 0,
  };
}

function toVariant(row: Record<string, unknown>): CatalogVariant {
  const label = typeof row.label === "string" ? row.label : "Variante";
  const colorHex = normalizeColorHex(
    typeof row.color_hex === "string" ? row.color_hex : null,
  );
  return {
    id: String(row.id),
    externalCode:
      typeof row.external_code === "string" ? row.external_code : null,
    name: typeof row.name === "string" && row.name.trim() ? row.name : label,
    slug: typeof row.slug === "string" ? row.slug : "",
    label,
    colorHex,
    colorName:
      typeof row.color_name === "string" && row.color_name.trim()
        ? row.color_name
        : null,
    showColor:
      row.show_color === true ||
      (row.show_color === undefined && colorHex !== null),
    showOptionText:
      row.show_option_text !== false && label !== "Opción de color",
    isPrimary: row.is_primary === true,
    price: price(row.price),
    compareAtPrice: price(row.compare_at_price),
    availability: availability(row.availability),
    active: row.active !== false,
    sortOrder: Number(row.sort_order) || 0,
    images: [],
  };
}

function toProduct(row: Record<string, unknown>): CatalogProduct {
  const rawImages = Array.isArray(row.catalog_product_images)
    ? row.catalog_product_images
    : [];
  const rawVariants = Array.isArray(row.catalog_variants)
    ? row.catalog_variants
    : [];
  const rawSpecs = Array.isArray(row.specifications) ? row.specifications : [];

  return {
    id: String(row.id),
    externalCode:
      typeof row.external_code === "string" ? row.external_code : null,
    slug: typeof row.slug === "string" ? row.slug : String(row.id),
    name: typeof row.name === "string" ? row.name : "Producto Terra",
    category: typeof row.category === "string" ? row.category : "Otros",
    shortDescription:
      typeof row.short_description === "string" ? row.short_description : "",
    description: typeof row.description === "string" ? row.description : "",
    specifications: rawSpecs.filter(
      (item): item is string => typeof item === "string",
    ),
    priceFrom: price(row.price_from),
    compareAtPriceFrom: price(row.compare_at_price_from),
    availability: availability(row.availability),
    published: row.published === true,
    featured: row.featured === true,
    sortOrder: Number(row.sort_order) || 0,
    images: rawImages
      .map((item) => toImage(item as Record<string, unknown>))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    variants: rawVariants
      .map((item) => toVariant(item as Record<string, unknown>))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

function toHome(row: Record<string, unknown> | null): CatalogHomeSettings {
  if (!row) return DEFAULT_CATALOG_HOME;
  const imagePath = typeof row.image_path === "string" ? row.image_path : "";
  return {
    eyebrow:
      typeof row.eyebrow === "string" && row.eyebrow.trim()
        ? row.eyebrow
        : DEFAULT_CATALOG_HOME.eyebrow,
    title:
      typeof row.title === "string" && row.title.trim()
        ? row.title
        : DEFAULT_CATALOG_HOME.title,
    description:
      typeof row.description === "string" && row.description.trim()
        ? row.description
        : DEFAULT_CATALOG_HOME.description,
    imageUrl: imagePath ? publicImageUrl(imagePath) : null,
  };
}

const legacyProductFields =
  "id, external_code, slug, name, category, short_description, description, specifications, price_from, compare_at_price_from, availability, published, featured, sort_order, catalog_variants(id, external_code, label, price, compare_at_price, availability, active, sort_order), catalog_product_images(id, storage_path, alt_text, sort_order)";
const productFields =
  "id, external_code, slug, name, category, short_description, description, specifications, price_from, compare_at_price_from, availability, published, featured, sort_order, catalog_variants(id, external_code, name, slug, label, color_hex, color_name, show_color, show_option_text, is_primary, price, compare_at_price, availability, active, sort_order), catalog_product_images(id, storage_path, alt_text, sort_order)";

async function attachVariantImages(
  products: CatalogProduct[],
): Promise<CatalogProduct[]> {
  const variantIds = products.flatMap((product) =>
    product.variants.map((variant) => variant.id),
  );
  if (variantIds.length === 0) return products;
  const { data, error } = await getCatalogServerClient()
    .from("catalog_variant_images")
    .select("id, variant_id, storage_path, alt_text, sort_order")
    .in("variant_id", variantIds);
  if (error) {
    if (catalogVariantExtensionsMissing(error)) return products;
    throw new Error(error.message);
  }
  const byVariant = new Map<string, CatalogImage[]>();
  for (const row of data ?? []) {
    const item = row as Record<string, unknown>;
    const variantId =
      typeof item.variant_id === "string" ? item.variant_id : "";
    if (!variantId) continue;
    byVariant.set(variantId, [
      ...(byVariant.get(variantId) ?? []),
      toImage(item),
    ]);
  }
  return products.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      images: (byVariant.get(variant.id) ?? []).sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ),
    })),
  }));
}

async function queryProductRows(
  publishedOnly: boolean,
): Promise<Record<string, unknown>[]> {
  const select = async (fields: string) => {
    const request = getCatalogServerClient()
      .from("catalog_products")
      .select(fields)
      .order("sort_order", { ascending: true });
    return publishedOnly ? await request.eq("published", true) : await request;
  };
  const extended = await select(productFields);
  if (!extended.error)
    return (extended.data ?? []) as unknown as Record<string, unknown>[];
  if (!catalogVariantExtensionsMissing(extended.error))
    throw new Error(extended.error.message);
  const legacy = await select(legacyProductFields);
  if (legacy.error) throw new Error(legacy.error.message);
  return (legacy.data ?? []) as unknown as Record<string, unknown>[];
}

async function querySingleProduct(
  column: "id" | "slug",
  value: string,
  publishedOnly: boolean,
): Promise<Record<string, unknown> | null> {
  const select = async (fields: string) => {
    let request = getCatalogServerClient()
      .from("catalog_products")
      .select(fields)
      .eq(column, value);
    if (publishedOnly) request = request.eq("published", true);
    return await request.maybeSingle();
  };
  const extended = await select(productFields);
  if (!extended.error) return extended.data as Record<string, unknown> | null;
  if (!catalogVariantExtensionsMissing(extended.error))
    throw new Error(extended.error.message);
  const legacy = await select(legacyProductFields);
  if (legacy.error) throw new Error(legacy.error.message);
  return legacy.data as Record<string, unknown> | null;
}

async function queryProducts(
  publishedOnly: boolean,
): Promise<CatalogProduct[]> {
  return attachVariantImages(
    (await queryProductRows(publishedOnly)).map(toProduct),
  );
}

async function queryProductIdByVariantSlug(
  slug: string,
): Promise<string | null> {
  const { data, error } = await getCatalogServerClient()
    .from("catalog_variants")
    .select("product_id")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    if (catalogVariantExtensionsMissing(error)) return null;
    throw new Error(error.message);
  }
  return typeof data?.product_id === "string" ? data.product_id : null;
}

function publicEntry(
  product: CatalogProduct,
  requestedSlug: string,
): { product: CatalogProduct; selectedVariantId: string | null } {
  const activeVariants = product.variants.filter((variant) => variant.active);
  const selected =
    activeVariants.find((variant) => variant.slug === requestedSlug) ??
    activeVariants.find((variant) => variant.isPrimary) ??
    activeVariants[0] ??
    null;
  return { product, selectedVariantId: selected?.id ?? null };
}

export async function getCatalogSnapshot(): Promise<CatalogSnapshot> {
  if (!isCatalogConfigured()) {
    return {
      products:
        process.env.NODE_ENV === "production"
          ? []
          : DEVELOPMENT_CATALOG_PREVIEW,
      home: DEFAULT_CATALOG_HOME,
    };
  }

  try {
    const [products, homeResult] = await Promise.all([
      queryProducts(true),
      getCatalogServerClient()
        .from("catalog_home_settings")
        .select("eyebrow, title, description, image_path")
        .eq("id", "home")
        .maybeSingle(),
    ]);
    if (homeResult.error) throw new Error(homeResult.error.message);
    return {
      products,
      home: toHome(homeResult.data as Record<string, unknown> | null),
    };
  } catch (error) {
    if (!catalogSchemaMissing(error))
      console.error("[catalog] no se pudo leer el catálogo publicado:", error);
    return {
      products:
        process.env.NODE_ENV === "production"
          ? []
          : DEVELOPMENT_CATALOG_PREVIEW,
      home: DEFAULT_CATALOG_HOME,
    };
  }
}

/**
 * Fuente de RAG: nunca devuelve los datos demo usados únicamente para la UI de
 * desarrollo. Si Supabase no está disponible, el agente debe derivar en vez de
 * presentar información comercial inventada.
 */
export async function getPublishedCatalogProductsForRag(): Promise<
  CatalogProduct[]
> {
  if (!isCatalogConfigured()) return [];
  try {
    return await queryProducts(true);
  } catch (error) {
    console.error("[catalog] no se pudo leer el catálogo para RAG:", error);
    return [];
  }
}

export async function getPublishedCatalogEntryBySlug(slug: string): Promise<{
  product: CatalogProduct;
  selectedVariantId: string | null;
} | null> {
  if (!isCatalogConfigured()) {
    if (process.env.NODE_ENV === "production") return null;
    const product = DEVELOPMENT_CATALOG_PREVIEW.find(
      (item) =>
        item.slug === slug ||
        item.variants.some((variant) => variant.slug === slug),
    );
    return product ? publicEntry(product, slug) : null;
  }
  try {
    const variantProductId = await queryProductIdByVariantSlug(slug);
    const data = variantProductId
      ? await querySingleProduct("id", variantProductId, true)
      : await querySingleProduct("slug", slug, true);
    if (!data) return null;
    return publicEntry((await attachVariantImages([toProduct(data)]))[0], slug);
  } catch (error) {
    if (!catalogSchemaMissing(error))
      console.error("[catalog] no se pudo leer un producto publicado:", error);
    if (process.env.NODE_ENV === "production") return null;
    const product = DEVELOPMENT_CATALOG_PREVIEW.find(
      (item) =>
        item.slug === slug ||
        item.variants.some((variant) => variant.slug === slug),
    );
    return product ? publicEntry(product, slug) : null;
  }
}

/** Compatibilidad con los flujos de pedido que resuelven una ficha por URL. */
export async function getPublishedProductBySlug(
  slug: string,
): Promise<CatalogProduct | null> {
  return (await getPublishedCatalogEntryBySlug(slug))?.product ?? null;
}

export async function getProductForCatalogLead(
  productId: string,
  variantId: string | null,
): Promise<{ product: CatalogProduct; variant: CatalogVariant | null } | null> {
  if (!isCatalogConfigured()) return null;
  try {
    const data = await querySingleProduct("id", productId, true);
    if (!data) return null;
    const product = (await attachVariantImages([toProduct(data)]))[0];
    const variant = variantId
      ? (product.variants.find(
          (item) => item.id === variantId && item.active,
        ) ?? null)
      : null;
    return { product, variant };
  } catch (error) {
    if (!catalogSchemaMissing(error))
      console.error(
        "[catalog] no se pudo resolver el contexto de WhatsApp:",
        error,
      );
    return null;
  }
}

export async function getAdminCatalogProducts(): Promise<CatalogProduct[]> {
  if (!isCatalogConfigured()) return DEVELOPMENT_CATALOG_PREVIEW;
  return queryProducts(false);
}

export { CATALOG_BUCKET };
