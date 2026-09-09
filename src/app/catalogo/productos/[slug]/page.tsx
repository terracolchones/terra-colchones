import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/catalog/ProductDetail";
import { getCatalogWhatsAppPhone, getPublishedProductBySlug } from "@/lib/catalog-storefront/server";

export const dynamic = "force-dynamic";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout?: string | string[] }>;
}

function checkoutToken(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{24,128}$/.test(value) ? value : null;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);
  if (!product) return { title: "Producto no disponible | Terra" };
  return { title: `${product.name} | Terra`, description: product.shortDescription || `Consulta ${product.name} por WhatsApp.` };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await params;
  const [product, whatsAppPhone] = await Promise.all([
    getPublishedProductBySlug(slug),
    getCatalogWhatsAppPhone(),
  ]);
  if (!product) notFound();
  return <ProductDetail product={product} whatsAppPhone={whatsAppPhone} checkoutToken={checkoutToken((await searchParams).checkout)} />;
}
