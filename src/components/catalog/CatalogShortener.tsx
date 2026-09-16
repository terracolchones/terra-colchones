"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { CatalogShortLink, SavedCatalogShortLink } from "@/lib/catalog-storefront/short-links";

export function CatalogShortener({ password }: { password: string }) {
  const [url, setUrl] = useState("");
  const [link, setLink] = useState<CatalogShortLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState("");
  const resultInput = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<SavedCatalogShortLink[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [listNotice, setListNotice] = useState("");
  const listRequest = useRef(0);

  const loadSaved = useCallback(async (nextPage = 0) => {
    const requestId = ++listRequest.current;
    setLoading(true);
    setListError(null);
    try {
      const response = await fetch(`/api/catalog/admin/short-links?page=${nextPage}`, { headers: { "X-Catalog-Admin-Key": password }, cache: "no-store" });
      const data = await response.json() as { links?: SavedCatalogShortLink[]; hasMore?: boolean; error?: string };
      if (!response.ok || !data.links) throw new Error(data.error || "No se pudieron cargar los enlaces.");
      if (requestId !== listRequest.current) return;
      setSaved(data.links); setHasMore(Boolean(data.hasMore)); setPage(nextPage);
    } catch (cause) {
      if (requestId === listRequest.current) setListError(cause instanceof Error ? cause.message : "No se pudieron cargar los enlaces.");
    } finally { if (requestId === listRequest.current) setLoading(false); }
  }, [password]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSaved(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSaved]);

  async function shorten(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setLink(null);
    setCopyNotice("");
    try {
      const response = await fetch("/api/catalog/admin/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Catalog-Admin-Key": password },
        body: JSON.stringify({ url }),
      });
      const data = await response.json() as { link?: CatalogShortLink; error?: string };
      if (!response.ok || !data.link) throw new Error(data.error || "No se pudo crear el enlace. Inténtalo de nuevo.");
      setLink(data.link);
      await loadSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.shortUrl);
      setCopyNotice("Enlace copiado. Ya puedes pegarlo en tu publicación.");
    } catch {
      resultInput.current?.focus();
      resultInput.current?.select();
      setCopyNotice("Seleccionamos el enlace para que puedas copiarlo manualmente.");
    }
  }

  async function removeLink(code: string) {
    setRemoving(true); setListError(null); setListNotice("");
    try {
      const response = await fetch(`/api/catalog/admin/short-links?code=${encodeURIComponent(code)}`, { method: "DELETE", headers: { "X-Catalog-Admin-Key": password } });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "No se pudo eliminar el enlace."); }
      if (link?.code === code) { setLink(null); setCopyNotice(""); }
      setConfirmRemove(null);
      setListNotice("Enlace eliminado. El producto y su enlace original siguen disponibles.");
      await loadSaved(saved.length === 1 && page > 0 ? page - 1 : page);
    } catch (cause) { setListError(cause instanceof Error ? cause.message : "No se pudo eliminar el enlace."); }
    finally { setRemoving(false); }
  }

  async function copySaved(item: SavedCatalogShortLink) {
    try {
      await navigator.clipboard.writeText(item.shortUrl);
      setListNotice(`Enlace de ${item.productName} copiado.`);
    } catch {
      const input = document.getElementById(`saved-${item.code}`) as HTMLInputElement | null;
      input?.focus(); input?.select();
      setListNotice("Seleccionamos el enlace para que puedas copiarlo manualmente.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl py-3 sm:py-8">
      <p className="text-xs font-bold tracking-[0.16em] text-[#8f1519]">ENLACES TERRA</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Acortador de enlaces</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Pega el enlace de cualquier producto publicado y obtén una dirección corta para compartir en tus redes.</p>

      <form onSubmit={(event) => void shorten(event)} className="mt-8" aria-busy={busy}>
        <label htmlFor="product-long-url" className="block text-sm font-semibold text-slate-800">Enlace del producto</label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input id="product-long-url" name="url" type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={2048} value={url} disabled={busy}
            onChange={(event) => { setUrl(event.target.value); setLink(null); setError(null); setCopyNotice(""); }}
            placeholder="https://terracolchonesymuebles.online/catalogo/productos/…"
            aria-describedby={error ? "shortener-help shortener-error" : "shortener-help"} aria-invalid={Boolean(error)}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-4 text-sm outline-none focus:border-[#8f1519] focus:ring-2 focus:ring-[#8f1519]/15 disabled:bg-slate-50" />
          <button type="submit" disabled={busy || !url.trim()} className="min-h-12 shrink-0 rounded-xl bg-[#8f1519] px-7 text-sm font-bold text-white transition hover:bg-[#731115] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Creando enlace…" : "Acortar enlace"}</button>
        </div>
        <p id="shortener-help" className="mt-3 text-xs leading-5 text-slate-500">Funciona con productos actuales y con los que publiques más adelante.</p>
        {error && <p id="shortener-error" role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      </form>

      <div aria-live="polite" aria-atomic="true">
        {link && <section className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-6" aria-label="Enlace corto creado">
          <p className="text-xs font-bold tracking-wide text-emerald-800">TU ENLACE ESTÁ LISTO</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">{link.productName}</h3>
          <label htmlFor="product-short-url" className="mt-4 block text-xs font-semibold text-slate-600">Enlace corto para compartir</label>
          <input ref={resultInput} id="product-short-url" readOnly value={link.shortUrl} onFocus={(event) => event.target.select()} className="mt-2 min-h-12 w-full rounded-lg border border-emerald-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-emerald-600" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void copyLink()} className="min-h-11 rounded-lg bg-[#8f1519] px-5 text-sm font-bold text-white hover:bg-[#731115]">Copiar enlace corto</button>
            <a href={link.shortUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-900">Abrir producto ↗</a>
          </div>
          {copyNotice && <p role="status" className="mt-3 text-sm text-emerald-900">{copyNotice}</p>}
        </section>}
      </div>

      <section className="mt-9 border-t border-slate-200 pt-6" aria-label="Enlaces guardados">
        <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold text-slate-900">Enlaces guardados</h3><button type="button" disabled={loading || removing} onClick={() => void loadSaved(page)} className="min-h-11 px-2 text-sm font-semibold text-[#8f1519] disabled:opacity-50">Actualizar</button></div>
        <p className="mt-1 text-sm leading-6 text-slate-500">Se guardan automáticamente. Vuelve aquí para copiarlos o eliminarlos.</p>
        {listNotice && <p role="status" className="mt-3 text-sm text-emerald-800">{listNotice}</p>}
        {listError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{listError}</p>}
        {loading ? <p className="py-8 text-sm text-slate-500">Cargando enlaces…</p> : !saved.length && !listError ? <p className="my-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Aún no hay enlaces guardados. Crea el primero arriba.</p> : <ul className="mt-5 space-y-3">
          {saved.map((item) => <li key={item.code} className="rounded-xl border border-slate-200 p-4">
            <p className="font-semibold text-slate-900">{item.productName}</p>
            <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleDateString("es-BO")}{!item.available && " · Producto no publicado o versión no disponible"}</p>
            <label htmlFor={`saved-${item.code}`} className="sr-only">Enlace guardado de {item.productName}</label>
            <input id={`saved-${item.code}`} readOnly value={item.shortUrl} onFocus={(event) => event.target.select()} className="mt-3 min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800" />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void copySaved(item)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800">Copiar</button>
              {item.available && <a href={item.shortUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[#8f1519]">Abrir ↗</a>}
              <button type="button" disabled={removing} onClick={() => setConfirmRemove(item.code)} className="ml-auto min-h-11 px-2 text-sm font-semibold text-red-700 disabled:opacity-50">Eliminar</button>
            </div>
            {confirmRemove === item.code && <div className="mt-3 rounded-lg bg-red-50 p-3"><p className="text-sm leading-6 text-red-900">Este enlace corto dejará de funcionar, incluso en publicaciones anteriores. El producto y su enlace original se conservan.</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={removing} onClick={() => void removeLink(item.code)} className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{removing ? "Eliminando…" : "Sí, eliminar enlace"}</button><button type="button" disabled={removing} onClick={() => setConfirmRemove(null)} className="min-h-11 px-3 text-sm font-semibold text-slate-700">Cancelar</button></div></div>}
          </li>)}
        </ul>}
        {(page > 0 || hasMore) && <div className="mt-4 flex items-center justify-between gap-3 text-sm"><button type="button" disabled={loading || removing || page === 0} onClick={() => void loadSaved(page - 1)} className="min-h-11 px-3 font-semibold disabled:opacity-40">Anterior</button><span>Página {page + 1}</span><button type="button" disabled={loading || removing || !hasMore} onClick={() => void loadSaved(page + 1)} className="min-h-11 px-3 font-semibold disabled:opacity-40">Siguiente</button></div>}
      </section>

      <div className="mt-8 grid gap-4 border-t border-slate-100 pt-6 text-sm sm:grid-cols-2">
        <div><h3 className="font-semibold text-slate-800">Directo a tu producto</h3><p className="mt-1 leading-6 text-slate-500">Con tu dominio de Terra, sin anuncios ni páginas intermedias.</p></div>
        <div><h3 className="font-semibold text-slate-800">Un enlace que se conserva</h3><p className="mt-1 leading-6 text-slate-500">Si vuelves a pegar el mismo producto, recuperas su enlace corto.</p></div>
      </div>
    </div>
  );
}
