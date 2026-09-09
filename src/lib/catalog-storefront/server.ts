import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CATALOG_HOME, DEVELOPMENT_CATALOG_PREVIEW } from "@/lib/catalog-storefront/demo";
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
const VALID_AVAILABILITY = new Set<ProductAvailability>(["available", "out_of_stock", "coming_soon"]);
// Último recurso para no desactivar la compra si Graph o las variables de Meta
// no están disponibles durante el renderizado del catálogo.
const DEFAULT_CATALOG_WHATSAPP_PHONE = "59178600064";

let client: SupabaseClient | undefined;

function configuredSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) throw new Error("Falta configurar SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL");
  return url;
}

function configuredSupabaseSecret(): string {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("Falta configurar SUPABASE_SECRET_KEY o SUPABASE_SERVICE_ROLE_KEY");
  return secret;
}

export function isCatalogConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(url && secret);
}

/**
 * El catálogo debe abrir el mismo número que usa la Cloud API. La variable
 * privada solo sirve de respaldo cuando Graph no puede consultarse (por
 * ejemplo, si el catálogo se despliega sin las credenciales de Meta).
 */
function configuredCatalogWhatsAppPhone(): string | null {
  return normalizeWhatsAppPhone(process.env.TERRA_WHATSAPP_PHONE)
    ?? normalizeWhatsAppPhone(process.env.NEXT_PUBLIC_TERRA_WHATSAPP_PHONE)
    ?? DEFAULT_CATALOG_WHATSAPP_PHONE;
}

export async function getCatalogWhatsAppPhone(): Promise<string | null> {
  const fallback = configuredCatalogWhatsAppPhone();

  try {
    const phone = normalizeWhatsAppPhone((await getPhoneNumberInfo()).display_phone_number);
    if (!phone) {
      console.warn("[catalog] Meta no devolvió un número de WhatsApp válido; se usa el respaldo configurado.");
      return fallback;
    }
    if (fallback && fallback !== phone) {
      console.warn("[catalog] El número configurado no coincide con el número activo de Meta; se usa el de Meta.");
    }
    return phone;
  } catch {
    console.warn("[catalog] No se pudo consultar el número activo de Meta; se usa el respaldo configurado.");
    return fallback;
  }
}

export function getCatalogServerClient(): SupabaseClient {
  if (client) return client;

  client = createClient(configuredSupabaseUrl(), configuredSupabaseSecret(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return client;
}

function availability(value: unknown): ProductAvailability {
  return typeof value === "string" && VALID_AVAILABILITY.has(value as ProductAvailability)
    ? value as ProductAvailability
    : "coming_soon";
}

function price(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function publicImageUrl(path: string): string {
  if (!path || !isCatalogConfigured()) return "";
  return getCatalogServerClient().storage.from(CATALOG_BUCKET).getPublicUrl(path).data.publicUrl;
}

function catalogSchemaMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Could not find the table") || message.includes("relation \"catalog_");
}

function toImage(row: Record<string, unknown>): CatalogImage {
  const path = typeof row.storage_path === "string" ? row.storage_path : "";
  return {
    id: String(row.id),
    path,
    url: publicImageUrl(path),
    alt: typeof row.alt_text === "string" ? row.alt_text : "Imagen del producto Terra",
    sortOrder: Number(row.sort_order) || 0,
  };
}

function toVariant(row: Record<string, unknown>): CatalogVariant {
  return {
    id: String(row.id),
    externalCode: typeof row.external_code === "string" ? row.external_code : null,
    label: typeof row.label === "string" ? row.label : "Variante",
    price: price(row.price),
    compareAtPrice: price(row.compare_at_price),
    availability: availability(row.availability),
    active: row.active !== false,
    sortOrder: Number(row.sort_order) || 0,
  };
}

function toProduct(row: Record<string, unknown>): CatalogProduct {
  const rawImages = Array.isArray(row.catalog_product_images) ? row.catalog_product_images : [];
  const rawVariants = Array.isArray(row.catalog_variants) ? row.catalog_variants : [];
  const rawSpecs = Array.isArray(row.specifications) ? row.specifications : [];

  return {
    id: String(row.id),
    externalCode: typeof row.external_code === "string" ? row.external_code : null,
    slug: typeof row.slug === "string" ? row.slug : String(row.id),
    name: typeof row.name === "string" ? row.name : "Producto Terra",
    category: typeof row.category === "string" ? row.category : "Otros",
    shortDescription: typeof row.short_description === "string" ? row.short_description : "",
    description: typeof row.description === "string" ? row.description : "",
    specifications: rawSpecs.filter((item): item is string => typeof item === "string"),
    priceFrom: price(row.price_from),
    compareAtPriceFrom: price(row.compare_at_price_from),
    availability: availability(row.availability),
    published: row.published === true,
    featured: row.featured === true,
    sortOrder: Number(row.sort_order) || 0,
    images: rawImages.map((item) => toImage(item as Record<string, unknown>)).sort((a, b) => a.sortOrder - b.sortOrder),
    variants: rawVariants.map((item) => toVariant(item as Record<string, unknown>)).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

function toHome(row: Record<string, unknown> | null): CatalogHomeSettings {
  if (!row) return DEFAULT_CATALOG_HOME;
  const imagePath = typeof row.image_path === "string" ? row.image_path : "";
  return {
    eyebrow: typeof row.eyebrow === "string" && row.eyebrow.trim() ? row.eyebrow : DEFAULT_CATALOG_HOME.eyebrow,
    title: typeof row.title === "string" && row.title.trim() ? row.title : DEFAULT_CATALOG_HOME.title,
    description: typeof row.description === "string" && row.description.trim() ? row.description : DEFAULT_CATALOG_HOME.description,
    imageUrl: imagePath ? publicImageUrl(imagePath) : null,
  };
}

const productFields = "id, external_code, slug, name, category, short_description, description, specifications, price_from, compare_at_price_from, availability, published, featured, sort_order, catalog_variants(id, external_code, label, price, compare_at_price, availability, active, sort_order), catalog_product_images(id, storage_path, alt_text, sort_order)";

async function queryProducts(publishedOnly: boolean): Promise<CatalogProduct[]> {
  const request = getCatalogServerClient().from("catalog_products").select(productFields).order("sort_order", { ascending: true });
  const { data, error } = publishedOnly ? await request.eq("published", true) : await request;
  if (error) throw new Error(error.message);
  return (data ?? []).map((item) => toProduct(item as Record<string, unknown>));
}

export async function getCatalogSnapshot(): Promise<CatalogSnapshot> {
  if (!isCatalogConfigured()) {
    return { products: process.env.NODE_ENV === "production" ? [] : DEVELOPMENT_CATALOG_PREVIEW, home: DEFAULT_CATALOG_HOME };
  }

  try {
    const [products, homeResult] = await Promise.all([
      queryProducts(true),
      getCatalogServerClient().from("catalog_home_settings").select("eyebrow, title, description, image_path").eq("id", "home").maybeSingle(),
    ]);
    if (homeResult.error) throw new Error(homeResult.error.message);
    return { products, home: toHome(homeResult.data as Record<string, unknown> | null) };
  } catch (error) {
    if (!catalogSchemaMissing(error)) console.error("[catalog] no se pudo leer el catálogo publicado:", error);
    return { products: process.env.NODE_ENV === "production" ? [] : DEVELOPMENT_CATALOG_PREVIEW, home: DEFAULT_CATALOG_HOME };
  }
}

/**
 * Fuente de RAG: nunca devuelve los datos demo usados únicamente para la UI de
 * desarrollo. Si Supabase no está disponible, el agente debe derivar en vez de
 * presentar información comercial inventada.
 */
export async function getPublishedCatalogProductsForRag(): Promise<CatalogProduct[]> {
  if (!isCatalogConfigured()) return [];
  try {
    return await queryProducts(true);
  } catch (error) {
    console.error("[catalog] no se pudo leer el catálogo para RAG:", error);
    return [];
  }
}

export async function getPublishedProductBySlug(slug: string): Promise<CatalogProduct | null> {
  if (!isCatalogConfigured()) {
    return process.env.NODE_ENV === "production" ? null : DEVELOPMENT_CATALOG_PREVIEW.find((product) => product.slug === slug) ?? null;
  }
  try {
    const { data, error } = await getCatalogServerClient()
      .from("catalog_products")
      .select(productFields)
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toProduct(data as Record<string, unknown>) : null;
  } catch (error) {
    if (!catalogSchemaMissing(error)) console.error("[catalog] no se pudo leer un producto publicado:", error);
    return process.env.NODE_ENV === "production" ? null : DEVELOPMENT_CATALOG_PREVIEW.find((product) => product.slug === slug) ?? null;
  }
}

export async function getProductForCatalogLead(productId: string, variantId: string | null): Promise<{ product: CatalogProduct; variant: CatalogVariant | null } | null> {
  if (!isCatalogConfigured()) return null;
  try {
    const { data, error } = await getCatalogServerClient()
      .from("catalog_products")
      .select(productFields)
      .eq("id", productId)
      .eq("published", true)
      .maybeSingle();
    if (error || !data) return null;
    const product = toProduct(data as Record<string, unknown>);
    const variant = variantId ? product.variants.find((item) => item.id === variantId && item.active) ?? null : null;
    return { product, variant };
  } catch (error) {
    if (!catalogSchemaMissing(error)) console.error("[catalog] no se pudo resolver el contexto de WhatsApp:", error);
    return null;
  }
}

export async function getAdminCatalogProducts(): Promise<CatalogProduct[]> {
  if (!isCatalogConfigured()) return DEVELOPMENT_CATALOG_PREVIEW;
  return queryProducts(false);
}

export { CATALOG_BUCKET };
