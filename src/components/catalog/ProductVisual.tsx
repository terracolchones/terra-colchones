import type { CatalogProduct } from "@/lib/catalog-storefront/types";

/* Las imágenes se cargan desde el bucket dinámico del catálogo. */
/* eslint-disable @next/next/no-img-element */

interface ProductVisualProps {
  product: CatalogProduct;
  imageUrl?: string | null;
  alt?: string;
  compact?: boolean;
}

export function ProductVisual({ product, imageUrl, alt, compact = false }: ProductVisualProps) {
  const image = imageUrl ?? product.images[0]?.url ?? null;
  if (image) {
    return <img src={image} alt={alt ?? product.images[0]?.alt ?? product.name} className="h-full w-full object-cover" />;
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-stone-100 via-white to-stone-200 px-5 text-center text-stone-500">
      <span className={`grid place-items-center rounded-full border border-stone-300 bg-white text-stone-500 ${compact ? "size-10 text-xs" : "size-14 text-base"}`} aria-hidden="true">
        T
      </span>
      <span className={`mt-3 font-medium ${compact ? "text-[11px]" : "text-sm"}`}>Imagen próximamente</span>
    </div>
  );
}
