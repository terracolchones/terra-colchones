import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/catalog/ProductDetail";
import {
  getCatalogWhatsAppPhone,
  getPublishedCatalogEntryBySlug,
} from "@/lib/catalog-storefront/server";

export const dynamic = "force-dynamic";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout?: string | string[] }>;
}

function checkoutToken(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{24,128}$/.test(value)
    ? value
    : null;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getPublishedCatalogEntryBySlug(slug);
  if (!entry) return { title: "Producto no disponible | Terra" };
  const selected = entry.product.variants.find(
    (variant) => variant.id === entry.selectedVariantId,
  );
  const name = selected?.name || entry.product.name;
  return {
    title: `${name} | Terra`,
    description:
      entry.product.shortDescription || `Consulta ${name} por WhatsApp.`,
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: ProductPageProps) {
  const { slug } = await params;
  const [entry, whatsAppPhone] = await Promise.all([
    getPublishedCatalogEntryBySlug(slug),
    getCatalogWhatsAppPhone(),
  ]);
  if (!entry) notFound();
  return (
    <ProductDetail
      key={entry.selectedVariantId ?? entry.product.id}
      product={entry.product}
      initialVariantId={entry.selectedVariantId}
      whatsAppPhone={whatsAppPhone}
      checkoutToken={checkoutToken((await searchParams).checkout)}
    />
  );
}
