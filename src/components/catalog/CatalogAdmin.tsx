"use client";

/* Las URLs de Supabase se definen en tiempo de ejecución; se usan img dinámicos
 * para no fijar dominios de imágenes en la configuración de Next. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import { availabilityLabel } from "@/components/catalog/price";
import type { CatalogHomeSettings, CatalogImage, CatalogProduct, CatalogVariant, ProductAvailability } from "@/lib/catalog-storefront/types";

type EditableVariant = Omit<CatalogVariant, "id"> & { id?: string };
type EditableImage = Omit<CatalogImage, "id" | "url"> & { id?: string; url?: string };

interface EditableProduct {
  id?: string;
  externalCode: string;
  slug: string;
  name: string;
  category: string;
  shortDescription: string;
  description: string;
  specificationsText: string;
  priceFrom: string;
  compareAtPriceFrom: string;
  availability: ProductAvailability;
  published: boolean;
  featured: boolean;
  sortOrder: string;
  variants: EditableVariant[];
  images: EditableImage[];
}

const AVAILABILITY_OPTIONS: Array<{ value: ProductAvailability; label: string }> = [
  { value: "available", label: "Disponible" },
  { value: "out_of_stock", label: "Sin stock" },
  { value: "coming_soon", label: "Próximamente" },
];

function blankProduct(position: number): EditableProduct {
  return {
    externalCode: "",
    slug: "",
    name: "Nuevo producto",
    category: "Colchones",
    shortDescription: "",
    description: "",
    specificationsText: "",
    priceFrom: "",
    compareAtPriceFrom: "",
    availability: "coming_soon",
    published: false,
    featured: false,
    sortOrder: String(position),
    variants: [],
    images: [],
  };
}

function editableProduct(product: CatalogProduct): EditableProduct {
  return {
    id: product.id,
    externalCode: product.externalCode ?? "",
    slug: product.slug,
    name: product.name,
    category: product.category,
    shortDescription: product.shortDescription,
    description: product.description,
    specificationsText: product.specifications.join("\n"),
    priceFrom: product.priceFrom?.toString() ?? "",
    compareAtPriceFrom: product.compareAtPriceFrom?.toString() ?? "",
    availability: product.availability,
    published: product.published,
    featured: product.featured,
    sortOrder: String(product.sortOrder),
    variants: product.variants.map((variant) => ({ ...variant })),
    images: product.images.map((image) => ({ ...image })),
  };
}

function toPayload(product: EditableProduct) {
  const nullableNumber = (value: string) => value.trim() === "" ? null : Number(value);
  return {
    externalCode: product.externalCode,
    slug: product.slug,
    name: product.name,
    category: product.category,
    shortDescription: product.shortDescription,
    description: product.description,
    specifications: product.specificationsText.split("\n").map((item) => item.trim()).filter(Boolean),
    priceFrom: nullableNumber(product.priceFrom),
    compareAtPriceFrom: nullableNumber(product.compareAtPriceFrom),
    availability: product.availability,
    published: product.published,
    featured: product.featured,
    sortOrder: product.sortOrder.trim() === "" ? 0 : Number(product.sortOrder),
    variants: product.variants.map((variant) => ({
      id: variant.id ?? null,
      externalCode: variant.externalCode,
      label: variant.label,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      availability: variant.availability,
      active: variant.active,
      sortOrder: variant.sortOrder,
    })),
    images: product.images.map((image) => ({ id: image.id ?? null, path: image.path, alt: image.alt, sortOrder: image.sortOrder })),
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-bold text-slate-700">{children}</label>;
}

function TextInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (value: string) => void; placeholder?: string; type?: "text" | "number" | "password" }) {
  return <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-[#8f1519] focus:ring-4 focus:ring-[#8f1519]/10" />;
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" className="mt-0.5 size-4 accent-[#8f1519]" />
      <span><span className="block text-sm font-semibold text-slate-900">{label}</span><span className="mt-0.5 block text-xs leading-4 text-slate-500">{description}</span></span>
    </label>
  );
}

function AdminLogin({ onAccess }: { onAccess: (password: string) => void }) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "checking">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("checking");
    setMessage(null);
    try {
      const response = await fetch("/api/catalog/admin/products", { headers: { "X-Catalog-Admin-Key": password } });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "No se pudo abrir el panel");
      }
      onAccess(password);
    } catch (error) {
      setState("idle");
      setMessage(error instanceof Error ? error.message : "No se pudo abrir el panel");
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 px-5">
      <form onSubmit={signIn} className="w-full max-w-sm rounded-3xl border border-white/10 bg-white p-7 shadow-2xl">
        <p className="text-xs font-bold tracking-[0.14em] text-[#9a2022]">CATÁLOGO TERRA</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Panel privado</h1>
        <p className="mt-2 text-sm leading-5 text-slate-500">Escribe la clave de administrador para entrar directamente.</p>
        <label className="mt-6 block"><FieldLabel>Clave de administrador</FieldLabel><TextInput value={password} onChange={setPassword} placeholder="admin" type="password" /></label>
        <button disabled={!password || state === "checking"} className="mt-5 min-h-12 w-full rounded-xl bg-[#8f1519] px-4 text-sm font-bold text-white transition hover:bg-[#741115] disabled:cursor-wait disabled:opacity-60">
          {state === "checking" ? "Abriendo panel…" : "Entrar al panel"}
        </button>
        {message && <p className="mt-4 text-sm leading-5 text-rose-700">{message}</p>}
      </form>
    </main>
  );
}

function ProductEditor({ product, onChange, onSave, saving, onUpload, uploading }: {
  product: EditableProduct;
  onChange: (next: EditableProduct) => void;
  onSave: () => void;
  saving: boolean;
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  const update = <K extends keyof EditableProduct>(field: K, value: EditableProduct[K]) => onChange({ ...product, [field]: value });
  const updateVariant = (index: number, patch: Partial<EditableVariant>) => update("variants", product.variants.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...patch } : variant));
  const uploadInputId = `product-image-${product.id ?? "new"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
        <div><p className="text-xs font-bold tracking-[0.12em] text-[#9a2022]">EDITOR DE PRODUCTO</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{product.name || "Nuevo producto"}</h2></div>
        <button type="button" onClick={onSave} disabled={saving} className="min-h-11 rounded-xl bg-[#8f1519] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#741115] disabled:cursor-wait disabled:opacity-60">{saving ? "Guardando…" : "Guardar cambios"}</button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <Toggle checked={product.published} onChange={(value) => update("published", value)} label="Publicado" description="Visible para visitantes del catálogo." />
        <Toggle checked={product.featured} onChange={(value) => update("featured", value)} label="Destacado" description="Aparece primero en colecciones destacadas." />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-slate-950">Información comercial</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label><FieldLabel>Nombre</FieldLabel><TextInput value={product.name} onChange={(value) => update("name", value)} /></label>
          <label><FieldLabel>Categoría</FieldLabel><TextInput value={product.category} onChange={(value) => update("category", value)} placeholder="Colchones" /></label>
          <label><FieldLabel>Código del sistema futuro</FieldLabel><TextInput value={product.externalCode} onChange={(value) => update("externalCode", value)} placeholder="Opcional" /></label>
          <label><FieldLabel>URL del producto</FieldLabel><TextInput value={product.slug} onChange={(value) => update("slug", value)} placeholder="Se genera desde el nombre" /></label>
          <label><FieldLabel>Precio desde (Bs)</FieldLabel><TextInput type="number" value={product.priceFrom} onChange={(value) => update("priceFrom", value)} placeholder="Opcional" /></label>
          <label><FieldLabel>Precio anterior (Bs)</FieldLabel><TextInput type="number" value={product.compareAtPriceFrom} onChange={(value) => update("compareAtPriceFrom", value)} placeholder="Opcional" /></label>
          <label><FieldLabel>Disponibilidad</FieldLabel><select value={product.availability} onChange={(event) => update("availability", event.target.value as ProductAvailability)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-[#8f1519] focus:ring-4 focus:ring-[#8f1519]/10">{AVAILABILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><FieldLabel>Orden de aparición</FieldLabel><TextInput type="number" value={product.sortOrder} onChange={(value) => update("sortOrder", value)} /></label>
        </div>
        <label className="mt-4 block"><FieldLabel>Descripción breve</FieldLabel><textarea value={product.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-950 outline-none focus:border-[#8f1519] focus:ring-4 focus:ring-[#8f1519]/10" /></label>
        <label className="mt-4 block"><FieldLabel>Descripción completa</FieldLabel><textarea value={product.description} onChange={(event) => update("description", event.target.value)} rows={4} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-950 outline-none focus:border-[#8f1519] focus:ring-4 focus:ring-[#8f1519]/10" /></label>
        <label className="mt-4 block"><FieldLabel>Detalles técnicos</FieldLabel><textarea value={product.specificationsText} onChange={(event) => update("specificationsText", event.target.value)} placeholder="Un detalle por línea" rows={4} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-950 outline-none focus:border-[#8f1519] focus:ring-4 focus:ring-[#8f1519]/10" /></label>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-950">Variantes</h3><p className="mt-1 text-xs text-slate-500">Medidas, colores u opciones que el cliente puede elegir.</p></div><button type="button" onClick={() => update("variants", [...product.variants, { externalCode: null, label: "Nueva variante", price: null, compareAtPrice: null, availability: "available", active: true, sortOrder: product.variants.length + 1 }])} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:border-slate-500">Añadir</button></div>
        <div className="mt-4 space-y-3">
          {product.variants.length === 0 && <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">Este producto aún no tiene variantes.</p>}
          {product.variants.map((variant, index) => (
            <div key={variant.id ?? `new-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label><FieldLabel>Opción</FieldLabel><TextInput value={variant.label} onChange={(value) => updateVariant(index, { label: value })} /></label>
                <label><FieldLabel>Precio (Bs)</FieldLabel><TextInput type="number" value={variant.price?.toString() ?? ""} onChange={(value) => updateVariant(index, { price: value === "" ? null : Number(value) })} /></label>
                <label><FieldLabel>Código externo</FieldLabel><TextInput value={variant.externalCode ?? ""} onChange={(value) => updateVariant(index, { externalCode: value || null })} /></label>
                <label><FieldLabel>Disponibilidad</FieldLabel><select value={variant.availability} onChange={(event) => updateVariant(index, { availability: event.target.value as ProductAvailability })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950">{AVAILABILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              </div>
              <div className="mt-3 flex items-center justify-between"><label className="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={variant.active} onChange={(event) => updateVariant(index, { active: event.target.checked })} className="accent-[#8f1519]" /> Disponible para elegir</label><button type="button" onClick={() => update("variants", product.variants.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-bold text-rose-700">Quitar</button></div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-950">Fotos del producto</h3><p className="mt-1 text-xs text-slate-500">La primera foto será la portada del producto.</p></div>{product.id ? <label htmlFor={uploadInputId} className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:border-slate-500">{uploading ? "Subiendo…" : "Subir foto"}<input id={uploadInputId} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ""; }} className="sr-only" disabled={uploading} /></label> : <span className="text-xs text-slate-500">Guarda primero para subir fotos</span>}</div>
        {product.images.length === 0 ? <div className="mt-4 grid aspect-[16/8] place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500">Imagen pendiente</div> : <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{product.images.map((image, index) => <div key={image.id ?? image.path} className="overflow-hidden rounded-xl border border-slate-200"><div className="aspect-square bg-slate-100">{image.url ? <img src={image.url} alt={image.alt} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-slate-500">Cargando…</div>}</div><div className="p-2"><input value={image.alt} onChange={(event) => update("images", product.images.map((item, itemIndex) => itemIndex === index ? { ...item, alt: event.target.value } : item))} aria-label={`Descripción de la imagen ${index + 1}`} className="w-full rounded border border-slate-200 px-2 py-1 text-xs" /><button type="button" onClick={() => update("images", product.images.filter((_, itemIndex) => itemIndex !== index))} className="mt-2 text-xs font-bold text-rose-700">Quitar de la ficha</button></div></div>)}</div>}
      </section>
    </div>
  );
}

function CatalogHomeEditor({ home, onChange, onSave, saving }: { home: CatalogHomeSettings; onChange: (next: CatalogHomeSettings) => void; onSave: () => void; saving: boolean }) {
  return <div className="max-w-2xl space-y-5"><div className="border-b border-slate-200 pb-5"><p className="text-xs font-bold tracking-[0.12em] text-[#9a2022]">PORTADA PÚBLICA</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Mensaje principal</h2><p className="mt-2 text-sm leading-5 text-slate-500">Este bloque aparece al inicio del catálogo público.</p></div><section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5"><label className="block"><FieldLabel>Etiqueta</FieldLabel><TextInput value={home.eyebrow} onChange={(value) => onChange({ ...home, eyebrow: value })} /></label><label className="mt-4 block"><FieldLabel>Título</FieldLabel><TextInput value={home.title} onChange={(value) => onChange({ ...home, title: value })} /></label><label className="mt-4 block"><FieldLabel>Descripción</FieldLabel><textarea value={home.description} onChange={(event) => onChange({ ...home, description: event.target.value })} rows={4} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-950 outline-none focus:border-[#8f1519] focus:ring-4 focus:ring-[#8f1519]/10" /></label><button type="button" onClick={onSave} disabled={saving} className="mt-5 min-h-11 rounded-xl bg-[#8f1519] px-5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{saving ? "Guardando…" : "Guardar portada"}</button></section></div>;
}

function CatalogAdminDashboard({ password, onLogout }: { password: string; onLogout: () => void }) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selected, setSelected] = useState<EditableProduct | null>(null);
  const [home, setHome] = useState<CatalogHomeSettings | null>(null);
  const [section, setSection] = useState<"products" | "home">("products");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("X-Catalog-Admin-Key", password);
    const response = await fetch(path, { ...init, headers });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
    return data;
  }, [password]);

  const load = useCallback(async (): Promise<CatalogProduct[]> => {
    setLoading(true);
    try {
      const [productData, homeData] = await Promise.all([api("/api/catalog/admin/products"), api("/api/catalog/admin/home")]);
      const nextProducts = (productData as { products: CatalogProduct[] }).products;
      setProducts(nextProducts);
      setHome((homeData as { home: CatalogHomeSettings }).home);
      setSelected((current) => {
        if (!current) return nextProducts[0] ? editableProduct(nextProducts[0]) : null;
        if (!current.id) return current;
        const refreshed = nextProducts.find((item) => item.id === current.id);
        return refreshed ? editableProduct(refreshed) : nextProducts[0] ? editableProduct(nextProducts[0]) : null;
      });
      return nextProducts;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo cargar el catálogo");
      return [];
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveProduct() {
    if (!selected) return;
    setSaving(true);
    setNotice(null);
    try {
      const endpoint = selected.id ? `/api/catalog/admin/products/${selected.id}` : "/api/catalog/admin/products";
      const method = selected.id ? "PATCH" : "POST";
      const result = await api(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(toPayload(selected)) }) as { productId?: string };
      const refreshedProducts = await load();
      if (!selected.id && result.productId) {
        const product = refreshedProducts.find((item) => item.id === result.productId);
        if (product) setSelected(editableProduct(product));
      }
      setNotice("Cambios guardados.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudieron guardar los cambios");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File) {
    if (!selected?.id) return;
    setUploading(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("productId", selected.id);
      form.set("file", file);
      const result = await api("/api/catalog/admin/images", { method: "POST", body: form }) as { path: string; url: string };
      setSelected({ ...selected, images: [...selected.images, { path: result.path, url: result.url, alt: `${selected.name} - imagen ${selected.images.length + 1}`, sortOrder: selected.images.length + 1 }] });
      setNotice("Foto subida. Guarda el producto para publicarla en la ficha.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo subir la imagen");
    } finally {
      setUploading(false);
    }
  }

  async function saveHome() {
    if (!home) return;
    setSaving(true);
    setNotice(null);
    try {
      await api("/api/catalog/admin/home", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...home, imagePath: null }) });
      setNotice("Portada guardada.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar la portada");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-dvh bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-4"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.13em] text-[#9a2022]">TERRA</p><h1 className="mt-1 text-lg font-semibold">Administrador de catálogo</h1></div><button type="button" onClick={onLogout} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:border-slate-500">Salir</button></div></header>
      <div className="mx-auto grid max-w-7xl gap-5 p-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:p-6">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><button type="button" onClick={() => setSection("products")} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${section === "products" ? "bg-[#8f1519] text-white" : "text-slate-700 hover:bg-slate-100"}`}>Productos</button><button type="button" onClick={() => setSection("home")} className={`mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${section === "home" ? "bg-[#8f1519] text-white" : "text-slate-700 hover:bg-slate-100"}`}>Portada pública</button>{section === "products" && <><div className="my-4 border-t border-slate-100" /><button type="button" onClick={() => { setSelected(blankProduct(products.length + 1)); setSection("products"); }} className="w-full rounded-xl border border-dashed border-[#8f1519]/40 px-3 py-2.5 text-left text-sm font-bold text-[#8f1519]">+ Crear producto</button><div className="mt-3 space-y-1">{products.map((product) => <button key={product.id} type="button" onClick={() => setSelected(editableProduct(product))} className={`w-full rounded-xl px-3 py-2.5 text-left ${selected?.id === product.id ? "bg-rose-50" : "hover:bg-slate-50"}`}><span className="block truncate text-sm font-semibold text-slate-900">{product.name}</span><span className="mt-0.5 block text-xs text-slate-500">{product.published ? "Publicado" : "Borrador"} · {availabilityLabel(product.availability)}</span></button>)}</div></>}</aside>
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {notice && <p className="mb-5 rounded-xl bg-slate-100 px-3 py-2.5 text-sm text-slate-700">{notice}</p>}
          {loading ? <div className="grid min-h-80 place-items-center text-sm text-slate-500">Cargando catálogo…</div> : section === "home" && home ? <CatalogHomeEditor home={home} onChange={setHome} onSave={() => void saveHome()} saving={saving} /> : selected ? <ProductEditor product={selected} onChange={setSelected} onSave={() => void saveProduct()} saving={saving} onUpload={(file) => void uploadImage(file)} uploading={uploading} /> : <div className="grid min-h-80 place-items-center text-center"><div><h2 className="text-xl font-semibold text-slate-950">Aún no hay productos.</h2><p className="mt-2 text-sm text-slate-500">Crea el primero para comenzar a preparar el catálogo.</p></div></div>}
        </section>
      </div>
    </main>
  );
}

export function CatalogAdmin() {
  const [password, setPassword] = useState<string | null>(null);

  if (!password) return <AdminLogin onAccess={setPassword} />;
  return <CatalogAdminDashboard password={password} onLogout={() => setPassword(null)} />;
}
