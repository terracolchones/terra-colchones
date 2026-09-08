"use client";

/* Las imágenes se cargan desde el bucket dinámico del catálogo. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useMemo, useState } from "react";
import { availabilityLabel, formatBolivianos } from "@/components/catalog/price";
import { ProductVisual } from "@/components/catalog/ProductVisual";
import type { CatalogProduct } from "@/lib/catalog-storefront/types";
import { buildCatalogWhatsAppUrl } from "@/lib/catalog-storefront/whatsapp";

interface ProductDetailProps {
  product: CatalogProduct;
}

export function ProductDetail({ product }: ProductDetailProps) {
  const activeVariants = useMemo(() => product.variants.filter((variant) => variant.active), [product.variants]);
  const [selectedVariantId, setSelectedVariantId] = useState(activeVariants[0]?.id ?? null);
  const [activeImage, setActiveImage] = useState(0);
  const selectedVariant = activeVariants.find((variant) => variant.id === selectedVariantId) ?? null;
  const price = selectedVariant?.price ?? product.priceFrom;
  const compareAtPrice = selectedVariant?.compareAtPrice ?? product.compareAtPriceFrom;
  const currentAvailability = selectedVariant?.availability ?? product.availability;
  const activeImageUrl = product.images[activeImage]?.url ?? product.images[0]?.url ?? null;
  const whatsAppUrl = buildCatalogWhatsAppUrl(product, selectedVariant);

  return (
    <main className="min-h-dvh bg-white pb-24 text-stone-900">
      <div className="mx-auto max-w-3xl">
        <section className="relative h-[68svh] min-h-[20rem] max-h-[44rem] overflow-hidden bg-stone-100 sm:mx-auto sm:mt-4 sm:h-auto sm:min-h-0 sm:max-w-[31rem] sm:rounded-[1.65rem]">
          <div className="h-full sm:h-auto sm:aspect-square">
            <ProductVisual product={product} imageUrl={activeImageUrl} alt={product.images[activeImage]?.alt ?? product.name} />
          </div>
          <Link href="/catalogo" className="absolute left-4 top-4 grid size-11 place-items-center rounded-full bg-white/90 text-2xl text-stone-900 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f1519]" aria-label="Volver al catálogo">‹</Link>
        </section>

        <section className="px-5 pb-1 pt-3 sm:pt-7">
          <p className="text-[10px] font-bold tracking-[0.15em] text-[#9a2022] sm:text-[11px]">{product.category.toUpperCase()}</p>
          <h1 className="mt-1.5 text-[1.75rem] font-semibold leading-tight tracking-tight text-stone-950 sm:mt-2 sm:text-3xl">{product.name}</h1>
          <div className="mt-2 flex items-end gap-2 sm:mt-4">
            <p className="text-xl font-extrabold tracking-tight text-stone-950 sm:text-2xl">{formatBolivianos(price)}</p>
            {compareAtPrice !== null && compareAtPrice > (price ?? 0) && <p className="pb-1 text-sm text-stone-400 line-through">{formatBolivianos(compareAtPrice)}</p>}
          </div>
        </section>

        <article className="mx-5 mt-8 border-t border-stone-200 pb-6 pt-6 sm:mx-0 sm:mt-7 sm:px-5">
          {product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Galería de imágenes">
              {product.images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  aria-label={`Ver imagen ${index + 1}`}
                  aria-pressed={activeImage === index}
                  onClick={() => setActiveImage(index)}
                  className={`size-14 shrink-0 overflow-hidden rounded-xl border-2 bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f1519] ${activeImage === index ? "border-[#8f1519]" : "border-transparent"}`}
                >
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700 sm:mt-3 sm:px-3 sm:py-1.5 sm:text-xs">
            <span className={`size-2 rounded-full ${currentAvailability === "available" ? "bg-emerald-500" : currentAvailability === "out_of_stock" ? "bg-stone-400" : "bg-amber-400"}`} aria-hidden="true" />
            {availabilityLabel(currentAvailability)}
          </div>

          {product.shortDescription && <p className="mt-4 text-[15px] leading-6 text-stone-600 sm:mt-5">{product.shortDescription}</p>}

          {activeVariants.length > 0 && (
            <section className="mt-7 border-t border-stone-200 pt-6" aria-labelledby="variante-heading">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="variante-heading" className="text-sm font-bold text-stone-950">Elige una opción</h2>
                {selectedVariant && <span className="text-xs text-stone-500">{selectedVariant.label}</span>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {activeVariants.map((variant) => {
                  const selected = selectedVariantId === variant.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={`min-h-14 rounded-xl border px-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f1519] ${selected ? "border-stone-950 bg-stone-950 text-white" : "border-stone-200 bg-white text-stone-800 hover:border-stone-400"}`}
                    >
                      <span className="block text-sm font-semibold">{variant.label}</span>
                      {variant.price !== null && <span className={`mt-0.5 block text-xs ${selected ? "text-white/70" : "text-stone-500"}`}>{formatBolivianos(variant.price)}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {product.description && (
            <section className="mt-7 border-t border-stone-200 pt-6">
              <h2 className="text-sm font-bold text-stone-950">Descripción</h2>
              <p className="mt-3 text-[15px] leading-6 text-stone-600">{product.description}</p>
            </section>
          )}

          {product.specifications.length > 0 && (
            <section className="mt-7 border-t border-stone-200 pt-5">
              <details>
                <summary className="cursor-pointer list-none text-sm font-bold text-stone-950 marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between">Detalles del producto <span aria-hidden="true">⌄</span></span>
                </summary>
                <ul className="mt-4 space-y-2 text-sm leading-5 text-stone-600">
                  {product.specifications.map((specification) => <li key={specification} className="flex gap-2"><span className="text-[#9a2022]" aria-hidden="true">•</span>{specification}</li>)}
                </ul>
              </details>
            </section>
          )}
        </article>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 px-4 py-2 backdrop-blur sm:py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-stone-500">Compra por WhatsApp</p>
            <p className="truncate text-xs font-semibold text-stone-900 sm:text-sm">{selectedVariant?.label ?? product.name}</p>
          </div>
          <a href={whatsAppUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#148a4a] px-4 text-sm font-bold text-white shadow-lg shadow-[#148a4a]/20 transition hover:bg-[#0f743d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#148a4a] sm:min-h-12 sm:px-5">
            Comprar
          </a>
        </div>
      </div>
    </main>
  );
}
