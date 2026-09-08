"use client";

/* Las imágenes se cargan desde el bucket dinámico del catálogo. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useMemo, useState } from "react";
import { availabilityLabel, formatBolivianos } from "@/components/catalog/price";
import { ProductVisual } from "@/components/catalog/ProductVisual";
import type { CatalogHomeSettings, CatalogProduct } from "@/lib/catalog-storefront/types";

interface StorefrontHomeProps {
  products: CatalogProduct[];
  home: CatalogHomeSettings;
}

function ProductCard({ product }: { product: CatalogProduct }) {
  const image = product.images[0]?.url;
  return (
    <Link
      href={`/catalogo/productos/${encodeURIComponent(product.slug)}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-[1.35rem] border border-stone-200 bg-white shadow-[0_10px_26px_rgba(30,20,12,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(30,20,12,0.1)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8f1519]"
    >
      <div className="relative aspect-square overflow-hidden bg-stone-100">
        <ProductVisual product={product} imageUrl={image} compact />
        {product.availability !== "available" && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold text-stone-700 shadow-sm backdrop-blur">
            {availabilityLabel(product.availability)}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#9a2022]">{product.category}</p>
        <h2 className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-5 text-stone-900">{product.name}</h2>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            <span className="block text-[11px] text-stone-500">{product.priceFrom === null ? "" : "Desde"}</span>
            <span className="text-[15px] font-extrabold text-stone-950">{formatBolivianos(product.priceFrom)}</span>
          </div>
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-stone-900 text-lg text-white transition group-hover:bg-[#9a2022]" aria-hidden="true">→</span>
        </div>
      </div>
    </Link>
  );
}

export function StorefrontHome({ products, home }: StorefrontHomeProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const categories = useMemo(() => ["Todos", ...Array.from(new Set(products.map((product) => product.category)))], [products]);
  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return products.filter((product) => {
      const matchesCategory = category === "Todos" || product.category === category;
      const searchText = `${product.name} ${product.category} ${product.shortDescription}`.toLocaleLowerCase("es");
      return matchesCategory && (!normalized || searchText.includes(normalized));
    });
  }, [category, products, query]);

  return (
    <main className="min-h-dvh bg-[#faf9f7] pb-10 text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200/90 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link
            href="/catalogo"
            className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#8f1519]"
            aria-label="Ir al catálogo Terra"
          >
            <img src="/catalogo/logo.jpg" alt="Terra Colchones y Muebles" className="h-full w-full object-contain" />
          </Link>
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Buscar productos</span>
            <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-stone-400" aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="¿Qué estás buscando?"
              className="h-11 w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-[#8f1519] focus:bg-white focus:ring-4 focus:ring-[#8f1519]/10"
            />
          </label>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4">
        <section className="mt-5 overflow-hidden rounded-[1.6rem] bg-stone-900 text-white shadow-[0_18px_32px_rgba(38,22,15,0.16)]">
          <div className="relative min-h-52 overflow-hidden px-6 py-7">
            {home.imageUrl && <img src={home.imageUrl} alt="Promoción Terra" className="absolute inset-0 h-full w-full object-cover opacity-45" />}
            <div className="absolute inset-0 bg-gradient-to-br from-[#8f1519] via-[#611114]/90 to-stone-950/95" />
            <div className="relative max-w-sm">
              <p className="text-[11px] font-bold tracking-[0.16em] text-white/70">{home.eyebrow}</p>
              <h1 className="mt-3 text-3xl font-semibold leading-[1.05] tracking-tight">{home.title}</h1>
              <p className="mt-3 max-w-xs text-sm leading-5 text-white/75">{home.description}</p>
            </div>
          </div>
        </section>

        <section aria-label="Categorías" className="mt-7">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-stone-900">Explora por categoría</h2>
            <span className="text-xs font-medium text-stone-500">{products.length} productos</span>
          </div>
          <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
            {categories.map((item) => {
              const selected = category === item;
              const letter = item === "Todos" ? "T" : item.slice(0, 1).toUpperCase();
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCategory(item)}
                  className="flex w-[74px] shrink-0 flex-col items-center gap-2 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f1519]"
                >
                  <span className={`grid size-14 place-items-center rounded-full border text-sm font-bold transition ${selected ? "border-[#8f1519] bg-[#8f1519] text-white shadow-lg shadow-[#8f1519]/20" : "border-stone-200 bg-white text-stone-500"}`}>
                    {letter}
                  </span>
                  <span className={`line-clamp-2 text-xs leading-4 ${selected ? "font-bold text-stone-900" : "font-medium text-stone-600"}`}>{item}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-7" aria-labelledby="productos-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold tracking-[0.14em] text-[#9a2022]">COLECCIÓN TERRA</p>
              <h2 id="productos-heading" className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">Productos</h2>
            </div>
            {query && <p className="pb-1 text-xs text-stone-500">{filteredProducts.length} resultados</p>}
          </div>

          {filteredProducts.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
              <p className="text-base font-semibold text-stone-900">Aún estamos preparando este catálogo.</p>
              <p className="mt-2 text-sm leading-5 text-stone-500">Vuelve pronto o escribe a Terra por WhatsApp para recibir atención directa.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
