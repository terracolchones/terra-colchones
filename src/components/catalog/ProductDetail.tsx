"use client";

/* Las imágenes se cargan desde el bucket dinámico del catálogo. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useMemo, useState } from "react";
import { availabilityLabel, formatBolivianos } from "@/components/catalog/price";
import { ProductVisual } from "@/components/catalog/ProductVisual";
import type { CatalogProduct } from "@/lib/catalog-storefront/types";
import { buildOrderConfirmationWhatsAppUrl } from "@/lib/catalog-storefront/whatsapp";

interface ProductDetailProps {
  product: CatalogProduct;
  whatsAppPhone: string | null;
  checkoutToken: string | null;
}

const COLOR_SWATCHES: Array<{ names: string[]; value: string }> = [
  { names: ["blanco", "white"], value: "#f8fafc" },
  { names: ["negro", "black"], value: "#1c1917" },
  { names: ["gris", "plomo", "gray", "grey"], value: "#9ca3af" },
  { names: ["beige", "crema", "cream"], value: "#d6b983" },
  { names: ["marron", "cafe", "chocolate", "tabaco", "brown"], value: "#75452f" },
  { names: ["rojo", "vino", "bordo", "red"], value: "#9a2022" },
  { names: ["azul", "blue"], value: "#3269a8" },
  { names: ["verde", "green"], value: "#3f7d4e" },
  { names: ["amarillo", "yellow"], value: "#d4a017" },
  { names: ["naranja", "orange"], value: "#dc7623" },
  { names: ["rosa", "pink"], value: "#db6d94" },
];

function colorForVariantLabel(label: string): string | null {
  const normalized = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");
  return COLOR_SWATCHES.find(({ names }) => names.some((name) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(normalized)))?.value ?? null;
}

export function ProductDetail({ product, whatsAppPhone, checkoutToken }: ProductDetailProps) {
  const activeVariants = useMemo(() => product.variants.filter((variant) => variant.active), [product.variants]);
  const [selectedVariantId, setSelectedVariantId] = useState(activeVariants[0]?.id ?? null);
  const [activeImage, setActiveImage] = useState(0);
  const [orderReadyToConfirm, setOrderReadyToConfirm] = useState(false);
  const [orderCode, setOrderCode] = useState<string | null>(null);
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const selectedVariant = activeVariants.find((variant) => variant.id === selectedVariantId) ?? null;
  const price = selectedVariant?.price ?? product.priceFrom;
  const compareAtPrice = selectedVariant?.compareAtPrice ?? product.compareAtPriceFrom;
  const currentAvailability = selectedVariant?.availability ?? product.availability;
  const activeImageUrl = product.images[activeImage]?.url ?? product.images[0]?.url ?? null;
  const whatsAppUrl = orderCode ? buildOrderConfirmationWhatsAppUrl(orderCode, whatsAppPhone) : null;
  const variantColors = activeVariants.map((variant) => colorForVariantLabel(variant.label));
  const hasOnlyColorVariants = activeVariants.length > 0 && variantColors.every((color) => color !== null);

  async function confirmOrder(): Promise<void> {
    if (confirmingOrder || !whatsAppPhone) return;
    setConfirmingOrder(true);
    setOrderError(null);
    try {
      const response = await fetch("/api/catalog-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSlug: product.slug,
          variantId: selectedVariant?.id ?? null,
          checkoutToken,
        }),
      });
      const data = await response.json() as { orderCode?: unknown; error?: unknown };
      if (!response.ok || typeof data.orderCode !== "string") {
        throw new Error(typeof data.error === "string" ? data.error : "No pudimos crear el pedido. Inténtalo nuevamente.");
      }
      setOrderCode(data.orderCode);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "No pudimos crear el pedido. Inténtalo nuevamente.");
    } finally {
      setConfirmingOrder(false);
    }
  }

  function resetOrderConfirmation(): void {
    setOrderReadyToConfirm(false);
    setOrderCode(null);
    setOrderError(null);
  }

  return (
    <main className="min-h-dvh bg-white pb-24 text-stone-900">
      <div className="mx-auto max-w-3xl">
        <section className="relative h-[68svh] min-h-[20rem] max-h-[44rem] overflow-hidden bg-stone-100 sm:mx-auto sm:mt-4 sm:h-auto sm:min-h-0 sm:max-w-[31rem] sm:rounded-[1.65rem]">
          <div className="h-full sm:h-auto sm:aspect-square">
            <ProductVisual product={product} imageUrl={activeImageUrl} alt={product.images[activeImage]?.alt ?? product.name} />
          </div>
          <Link href={`/catalogo${checkoutToken ? `?checkout=${encodeURIComponent(checkoutToken)}` : ""}`} className="absolute left-4 top-4 grid size-11 place-items-center rounded-full bg-white/90 text-2xl text-stone-900 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f1519]" aria-label="Volver al catálogo">‹</Link>
        </section>

        <section className="px-5 pb-1 pt-3 sm:pt-7">
          <p className="text-[10px] font-bold tracking-[0.15em] text-[#9a2022] sm:text-[11px]">{product.category.toUpperCase()}</p>
          <h1 className="mt-1.5 text-[1.75rem] font-semibold leading-tight tracking-tight text-stone-950 sm:mt-2 sm:text-3xl">{product.name}</h1>
          <div className="mt-2 flex items-end gap-2 sm:mt-4">
            <p className="text-xl font-extrabold tracking-tight text-stone-950 sm:text-2xl">{formatBolivianos(price)}</p>
            {compareAtPrice !== null && compareAtPrice > (price ?? 0) && <p className="pb-1 text-sm text-stone-400 line-through">{formatBolivianos(compareAtPrice)}</p>}
          </div>

          {activeVariants.length > 0 && (
            <section className="mt-5 border-t border-stone-200 pt-5" aria-labelledby="variante-heading">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="variante-heading" className="text-sm font-bold text-stone-950">{hasOnlyColorVariants ? "Elige un color" : "Elige una opción"}</h2>
                {selectedVariant && <span className="truncate text-xs text-stone-500">{selectedVariant.label}</span>}
              </div>

              {hasOnlyColorVariants ? (
                <div className="mt-3 flex flex-wrap gap-2.5" role="group" aria-label="Colores disponibles">
                  {activeVariants.map((variant, index) => {
                    const selected = selectedVariantId === variant.id;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        aria-label={variant.label}
                        aria-pressed={selected}
                        title={variant.label}
                        onClick={() => {
                          setSelectedVariantId(variant.id);
                          resetOrderConfirmation();
                        }}
                        className={`grid size-10 place-items-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f1519] ${selected ? "border-stone-950 bg-white" : "border-transparent bg-stone-100 hover:border-stone-300"}`}
                      >
                        <span className="size-7 rounded-full border border-stone-300/60" style={{ backgroundColor: variantColors[index] ?? undefined }} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeVariants.map((variant) => {
                    const selected = selectedVariantId === variant.id;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setSelectedVariantId(variant.id);
                          resetOrderConfirmation();
                        }}
                        className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f1519] ${selected ? "border-stone-950 bg-stone-950 text-white" : "border-stone-200 bg-white text-stone-800 hover:border-stone-400"}`}
                      >
                        {variant.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}
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
          {whatsAppPhone ? (
            orderReadyToConfirm ? (
              whatsAppUrl ? (
                <a href={whatsAppUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#148a4a] px-4 text-sm font-bold text-white shadow-lg shadow-[#148a4a]/20 transition hover:bg-[#0f743d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#148a4a] sm:min-h-12 sm:px-5">
                  Volver a WhatsApp
                </a>
              ) : (
                <button type="button" onClick={() => void confirmOrder()} disabled={confirmingOrder} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#148a4a] px-4 text-sm font-bold text-white shadow-lg shadow-[#148a4a]/20 transition hover:bg-[#0f743d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#148a4a] disabled:cursor-wait disabled:opacity-60 sm:min-h-12 sm:px-5">
                  {confirmingOrder ? "Creando pedido…" : "Confirmar pedido"}
                </button>
              )
            ) : (
              <button type="button" onClick={() => { setOrderReadyToConfirm(true); setOrderError(null); }} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-bold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 sm:min-h-12 sm:px-5">
                Comprar
              </button>
            )
          ) : (
            <button type="button" disabled title="No hay un número de WhatsApp configurado" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-stone-300 px-4 text-sm font-bold text-stone-600 sm:min-h-12 sm:px-5">
              WhatsApp no disponible
            </button>
          )}
        </div>
        {orderError && <p role="alert" className="mx-auto mt-1 max-w-3xl text-xs font-medium text-red-700">{orderError}</p>}
      </div>
    </main>
  );
}
