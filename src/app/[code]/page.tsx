import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/catalog/ProductDetail";
import { getCatalogWhatsAppPhone } from "@/lib/catalog-storefront/server";
import { getEntryByShortCode } from "@/lib/catalog-storefront/short-links-server";
import { CATALOG_PUBLIC_ORIGIN } from "@/lib/catalog-storefront/short-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ShortProductPageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ checkout?: string | string[] }>;
}

export async function generateMetadata({ params }: ShortProductPageProps): Promise<Metadata> {
  const entry = await getEntryByShortCode((await params).code);
  if (!entry) return { title: "Producto no disponible | Terra", robots: { index: false, follow: false } };
  const { product, selectedVariantId } = entry;
  const variant = product.variants.find((item) => item.id === selectedVariantId);
  const title = `${variant?.name || product.name} | Terra`;
  const description = product.shortDescription || `Consulta ${variant?.name || product.name} por WhatsApp.`;
  const url = `${CATALOG_PUBLIC_ORIGIN}/catalogo/productos/${variant?.slug || product.slug}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images: (variant?.images.length ? variant.images : product.images).slice(0, 1).map((image) => ({ url: image.url, alt: image.alt })) },
  };
}

export default async function ShortProductPage({ params, searchParams }: ShortProductPageProps) {
  const entry = await getEntryByShortCode((await params).code);
  if (!entry) notFound();
  const checkout = (await searchParams).checkout;
  const token = typeof checkout === "string" && /^[A-Za-z0-9_-]{24,128}$/.test(checkout) ? checkout : null;
  return <ProductDetail key={entry.selectedVariantId ?? entry.product.id} product={entry.product} initialVariantId={entry.selectedVariantId} whatsAppPhone={await getCatalogWhatsAppPhone()} checkoutToken={token} />;
}
