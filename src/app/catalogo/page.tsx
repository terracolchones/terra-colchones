import { StorefrontHome } from "@/components/catalog/StorefrontHome";
import { getCatalogSnapshot } from "@/lib/catalog-storefront/server";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const snapshot = await getCatalogSnapshot();
  return <StorefrontHome products={snapshot.products} home={snapshot.home} />;
}
