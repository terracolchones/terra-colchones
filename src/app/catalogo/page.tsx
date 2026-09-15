import { StorefrontHome } from "@/components/catalog/StorefrontHome";
import { getCatalogSnapshot } from "@/lib/catalog-storefront/server";

export const dynamic = "force-dynamic";

interface CatalogPageProps {
  searchParams: Promise<{ checkout?: string | string[]; q?: string | string[] }>;
}

function checkoutToken(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{24,128}$/.test(value) ? value : null;
}

function searchQuery(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.slice(0, 120) : "";
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const snapshot = await getCatalogSnapshot();
  const params = await searchParams;
  return <StorefrontHome products={snapshot.products} home={snapshot.home} checkoutToken={checkoutToken(params.checkout)} initialQuery={searchQuery(params.q)} />;
}
