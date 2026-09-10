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

export function ProductDetail({ product, whatsAppPhone, checkoutToken }: ProductDetailProps) {
  const activeVariants = useMemo(() => product.variants.filter((variant) => variant.active), [product.variants]);
  const optionLabels = [...new Set(activeVariants.map((variant) => variant.label))];
  const [selectedOption, setSelectedOption] = useState<string | null>(optionLabels[0] ?? null);
  const variantsForOption = activeVariants.filter((variant) => variant.label === selectedOption);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(variantsForOption[0]?.id ?? null);
  const [activeImage, setActiveImage] = useState(0);
  const [orderReadyToConfirm, setOrderReadyToConfirm] = useState(false);
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const selectedVariant = variantsForOption.find((variant) => variant.id === selectedVariantId) ?? variantsForOption[0] ?? null;
  const price = selectedVariant?.price ?? product.priceFrom;
  const compareAtPrice = selectedVariant?.compareAtPrice ?? product.compareAtPriceFrom;
  const currentAvailability = selectedVariant?.availability ?? product.availability;
  const galleryImages = selectedVariant?.images.length ? selectedVariant.images : product.images;
  const imageIndex = Math.min(activeImage, Math.max(0, galleryImages.length - 1));
  const activeImageUrl = galleryImages[imageIndex]?.url ?? null;
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
      const whatsAppUrl = buildOrderConfirmationWhatsAppUrl(data.orderCode, whatsAppPhone);
      if (!whatsAppUrl) {
        throw new Error("No pudimos abrir WhatsApp. Inténtalo nuevamente.");
      }
      window.location.assign(whatsAppUrl);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "No pudimos crear el pedido. Inténtalo nuevamente.");
    } finally {
      setConfirmingOrder(false);
    }
  }

  function resetOrderConfirmation(): void {
    setOrderReadyToConfirm(false);
    setOrderError(null);
  }

  function renderOrderAction(widthClass = ""): React.ReactNode {
    if (!whatsAppPhone) {
      return <button type="button" disabled title="No hay un número de WhatsApp configurado" className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-stone-300 px-4 text-sm font-bold text-stone-600 sm:min-h-12 sm:px-5 ${widthClass}`}>WhatsApp no disponible</button>;
    }

    if (orderReadyToConfirm) {
      return <button type="button" onClick={() => void confirmOrder()} disabled={confirmingOrder} className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#148a4a] px-4 text-sm font-bold text-white shadow-lg shadow-[#148a4a]/20 transition hover:bg-[#0f743d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#148a4a] disabled:cursor-wait disabled:opacity-60 sm:min-h-12 sm:px-5 ${widthClass}`}>{confirmingOrder ? "Abriendo WhatsApp…" : "Confirmar pedido"}</button>;
    }

    return <button type="button" onClick={() => { setOrderReadyToConfirm(true); setOrderError(null); }} className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-bold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 sm:min-h-12 sm:px-5 ${widthClass}`}>Comprar</button>;
  }

  return (
    <main className="min-h-dvh bg-white pb-24 text-stone-900 lg:pb-14">
      <div className="mx-auto max-w-3xl lg:max-w-[76rem] lg:px-6 lg:py-10">
        <Link href={`/catalogo${checkoutToken ? `?checkout=${encodeURIComponent(checkoutToken)}` : ""}`} className="hidden items-center gap-2 text-sm font-semibold text-[#8f1519] transition hover:text-[#741115] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8f1519] lg:inline-flex" aria-label="Volver al catálogo"><span aria-hidden="true">←</span> Volver al catálogo</Link>
        <div className="lg:mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.94fr)] lg:items-start lg:gap-12 xl:gap-16">
          <div className="min-w-0">
            <section className="relative h-[68svh] min-h-[20rem] max-h-[44rem] overflow-hidden bg-stone-100 sm:mx-auto sm:mt-4 sm:h-auto sm:min-h-0 sm:max-w-[31rem] sm:rounded-[1.65rem] lg:mx-0 lg:mt-0 lg:max-w-none lg:rounded-[1.5rem]">
              <div className="flex h-full snap-x snap-mandatory overflow-x-auto scroll-smooth lg:hidden" onScroll={(event) => { const width = event.currentTarget.clientWidth; if (width) setActiveImage(Math.round(event.currentTarget.scrollLeft / width)); }}>
                {(galleryImages.length > 0 ? galleryImages : [null]).map((image) => <div key={image?.id ?? "placeholder"} className="h-full w-full shrink-0 snap-center sm:aspect-square"><ProductVisual product={product} imageUrl={image?.url ?? null} alt={image?.alt ?? product.name} /></div>)}
              </div>
              <div className="hidden h-full sm:aspect-square lg:block"><ProductVisual product={product} imageUrl={activeImageUrl} alt={galleryImages[imageIndex]?.alt ?? product.name} /></div>
              <Link href={`/catalogo${checkoutToken ? `?checkout=${encodeURIComponent(checkoutToken)}` : ""}`} className="absolute left-4 top-4 grid size-11 place-items-center rounded-full bg-white/90 text-2xl text-stone-900 shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f1519] lg:hidden" aria-label="Volver al catálogo">‹</Link>
              {galleryImages.length > 1 && <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5 lg:hidden" aria-label="Posición en la galería">{galleryImages.map((image, index) => <span key={image.id} className={`size-2 rounded-full border border-white/70 shadow-sm ${imageIndex === index ? "bg-white" : "bg-white/50"}`} />)}</div>}
            </section>

            {galleryImages.length > 1 && (
              <div className="mt-3 hidden grid-cols-3 gap-3 lg:grid" aria-label="Galería de imágenes">
                {galleryImages.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    aria-label={`Ver imagen ${index + 1}`}
                    aria-pressed={activeImage === index}
                    onClick={() => setActiveImage(index)}
                    className={`aspect-square overflow-hidden rounded-xl border-2 bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f1519] ${activeImage === index ? "border-[#8f1519]" : "border-transparent hover:border-stone-300"}`}
                  >
                    <img src={image.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <section className="px-5 pb-1 pt-3 sm:pt-7 lg:px-0 lg:pt-7">
          <p className="text-[10px] font-bold tracking-[0.15em] text-[#9a2022] sm:text-[11px]">{product.category.toUpperCase()}</p>
          <h1 className="mt-1.5 text-[1.75rem] font-semibold leading-tight tracking-tight text-stone-950 sm:mt-2 sm:text-3xl lg:text-[2.65rem]">{product.name}</h1>
          <div className="mt-2 flex items-end gap-2 sm:mt-4">
            <p className="text-xl font-extrabold tracking-tight text-stone-950 sm:text-2xl lg:text-3xl">{formatBolivianos(price)}</p>
            {compareAtPrice !== null && compareAtPrice > (price ?? 0) && <p className="pb-1 text-sm text-stone-400 line-through">{formatBolivianos(compareAtPrice)}</p>}
          </div>

          <div className="mt-4 hidden items-center gap-2 text-sm font-medium text-stone-600 lg:inline-flex">
            <span className={`size-2 rounded-full ${currentAvailability === "available" ? "bg-emerald-500" : currentAvailability === "out_of_stock" ? "bg-stone-400" : "bg-amber-400"}`} aria-hidden="true" />
            {availabilityLabel(currentAvailability)}
          </div>

          {optionLabels.length > 0 && (
            <section className="mt-5 border-t border-stone-200 pt-5" aria-labelledby="variante-heading">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="variante-heading" className="text-sm font-bold text-stone-950">Elige una opción</h2>
                {selectedVariant && <span className="truncate text-xs text-stone-500">{selectedVariant.label}</span>}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                  {optionLabels.map((label) => {
                    const selected = selectedOption === label;
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          const nextVariant = activeVariants.find((variant) => variant.label === label) ?? null;
                          setSelectedOption(label);
                          setSelectedVariantId(nextVariant?.id ?? null);
                          setActiveImage(0);
                          resetOrderConfirmation();
                        }}
                        className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f1519] ${selected ? "border-stone-950 bg-stone-950 text-white" : "border-stone-200 bg-white text-stone-800 hover:border-stone-400"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
              </div>
            </section>
          )}

          {variantsForOption.filter((variant) => variant.colorHex).length > 0 && (
            <section className="mt-5 border-t border-stone-200 pt-5" aria-labelledby="color-heading">
              <h2 id="color-heading" className="sr-only">Elige un color</h2>
              <div className="flex flex-wrap gap-2.5" role="group" aria-label="Colores disponibles">
                {variantsForOption.filter((variant) => variant.colorHex).map((variant, index) => {
                  const selected = selectedVariant?.id === variant.id;
                  return <button key={variant.id} type="button" aria-label={`Color ${index + 1}`} aria-pressed={selected} onClick={() => { setSelectedVariantId(variant.id); setActiveImage(0); resetOrderConfirmation(); }} className={`grid size-10 place-items-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f1519] ${selected ? "border-stone-950 bg-white" : "border-transparent bg-stone-100 hover:border-stone-300"}`}><span className="size-7 rounded-full border border-stone-300/60" style={{ backgroundColor: variant.colorHex ?? undefined }} aria-hidden="true" /></button>;
                })}
              </div>
            </section>
          )}
          <div className="mt-7 hidden border-t border-stone-200 pt-5 lg:block">
            <p className="text-sm text-stone-500">Compra por WhatsApp</p>
            <p className="mt-1 text-sm font-semibold text-stone-900">{selectedVariant?.label ?? product.name}</p>
            <div className="mt-4">{renderOrderAction("w-full lg:w-64")}</div>
            {orderError && <p role="alert" className="mt-3 text-xs font-medium text-red-700">{orderError}</p>}
          </div>
          </section>
        </div>

        <article className="mx-5 mt-8 border-t border-stone-200 pb-6 pt-6 sm:mx-0 sm:mt-7 sm:px-5 lg:mx-0 lg:mt-14 lg:px-0 lg:pb-0 lg:pt-9">
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-700 sm:mt-3 sm:px-3 sm:py-1.5 sm:text-xs lg:hidden">
            <span className={`size-2 rounded-full ${currentAvailability === "available" ? "bg-emerald-500" : currentAvailability === "out_of_stock" ? "bg-stone-400" : "bg-amber-400"}`} aria-hidden="true" />
            {availabilityLabel(currentAvailability)}
          </div>

          {product.shortDescription && <p className="mt-4 text-[15px] leading-6 text-stone-600 sm:mt-5 lg:mx-auto lg:max-w-4xl lg:text-center">{product.shortDescription}</p>}

          {product.description && (
            <section className="mt-7 border-t border-stone-200 pt-6 lg:mx-auto lg:mt-10 lg:max-w-4xl lg:pt-8">
              <h2 className="text-sm font-bold text-stone-950 lg:text-center">Descripción</h2>
              <p className="mt-3 text-[15px] leading-6 text-stone-600 lg:text-center">{product.description}</p>
            </section>
          )}

          {product.specifications.length > 0 && (
            <section className="mt-7 border-t border-stone-200 pt-5 lg:mx-auto lg:max-w-4xl">
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 px-4 py-2 backdrop-blur sm:py-3 lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-stone-500">Compra por WhatsApp</p>
            <p className="truncate text-xs font-semibold text-stone-900 sm:text-sm">{selectedVariant?.label ?? product.name}</p>
          </div>
          {renderOrderAction()}
        </div>
        {orderError && <p role="alert" className="mx-auto mt-1 max-w-3xl text-xs font-medium text-red-700">{orderError}</p>}
      </div>
    </main>
  );
}
