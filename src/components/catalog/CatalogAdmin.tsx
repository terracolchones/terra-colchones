"use client";

/* Las URLs de Supabase se definen en tiempo de ejecución; se usan img dinámicos
 * para no fijar dominios de imágenes en la configuración de Next. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useId, useState } from "react";
import { availabilityLabel } from "@/components/catalog/price";
import { normalizeColorHex } from "@/lib/catalog-storefront/color-variants";
import type {
  CatalogHomeSettings,
  CatalogImage,
  CatalogProduct,
  CatalogVariant,
  ProductAvailability,
} from "@/lib/catalog-storefront/types";

const MAX_GALLERY_IMAGES = 3;
type EditableImage = Omit<CatalogImage, "id" | "url"> & {
  id?: string;
  url?: string;
};
type EditableVariant = Omit<
  CatalogVariant,
  "id" | "images" | "price" | "compareAtPrice"
> & {
  id?: string;
  price: string;
  compareAtPrice: string;
  images: EditableImage[];
};

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

function autoSlug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "nuevo-producto"
  );
}

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
    variants: product.variants.map((variant) => ({
      ...variant,
      price: variant.price?.toString() ?? "",
      compareAtPrice: variant.compareAtPrice?.toString() ?? "",
      images: variant.images.map((image) => ({ ...image })),
    })),
    images: product.images.map((image) => ({ ...image })),
  };
}

function blankVariant(product: EditableProduct): EditableVariant {
  const position =
    Math.max(0, ...product.variants.map((variant) => variant.sortOrder)) + 1;
  const name = `Nueva versión ${position}`;
  return {
    externalCode: null,
    name,
    slug: autoSlug(`${product.slug || product.name}-${name}`),
    label: "",
    colorHex: null,
    colorName: null,
    showColor: false,
    showOptionText: false,
    isPrimary: false,
    price: "",
    compareAtPrice: "",
    availability: product.availability,
    active: true,
    sortOrder: position,
    images: [],
  };
}

function duplicateVariant(variant: EditableVariant): EditableVariant {
  return {
    ...variant,
    id: undefined,
    externalCode: null,
    name: `${variant.name} copia`,
    slug: autoSlug(`${variant.slug || variant.name}-copia`),
    isPrimary: false,
    images: [],
  };
}

function toPayload(product: EditableProduct) {
  const nullableNumber = (value: string) =>
    value.trim() === "" ? null : Number(value);
  return {
    externalCode: product.externalCode,
    slug: product.slug,
    name: product.name,
    category: product.category,
    shortDescription: product.shortDescription,
    description: product.description || product.shortDescription,
    specifications: product.specificationsText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    priceFrom: nullableNumber(product.priceFrom),
    compareAtPriceFrom: nullableNumber(product.compareAtPriceFrom),
    availability: product.availability,
    published: product.published,
    featured: product.featured,
    sortOrder: product.sortOrder.trim() === "" ? 0 : Number(product.sortOrder),
    variants: product.variants.map((variant) => ({
      id: variant.id ?? null,
      externalCode: variant.externalCode,
      name: variant.name,
      slug: variant.slug,
      label: variant.label,
      colorHex: variant.colorHex,
      colorName: variant.colorName,
      showColor: variant.showColor,
      showOptionText: variant.showOptionText,
      isPrimary: variant.isPrimary,
      price: nullableNumber(variant.price),
      compareAtPrice: nullableNumber(variant.compareAtPrice),
      availability: variant.availability,
      active: variant.active,
      sortOrder: variant.sortOrder,
      images: variant.images.map((image) => ({
        id: image.id ?? null,
        path: image.path,
        alt: image.alt,
        sortOrder: image.sortOrder,
      })),
    })),
    images: product.images.map((image) => ({
      id: image.id ?? null,
      path: image.path,
      alt: image.alt,
      sortOrder: image.sortOrder,
    })),
  };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-bold text-slate-700">
      {children}
    </span>
  );
}
function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "password";
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-[#8f1519] focus:ring-4 focus:ring-[#8f1519]/10"
    />
  );
}

function PhotoDropzone({
  title,
  description,
  images,
  onUpload,
  onRemove,
  disabledMessage,
  uploading,
}: {
  title: string;
  description: string;
  images: EditableImage[];
  onUpload: (files: File[]) => void;
  onRemove: (index: number) => void;
  disabledMessage?: string;
  uploading: boolean;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const remaining = Math.max(0, MAX_GALLERY_IMAGES - images.length);
  const enabled = !disabledMessage && !uploading && remaining > 0;
  const submitFiles = (files: FileList | File[]) => {
    if (!enabled) return;
    const selected = Array.from(files)
      .filter((file) =>
        ["image/png", "image/jpeg", "image/webp"].includes(file.type),
      )
      .slice(0, remaining);
    if (selected.length > 0) onUpload(selected);
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">{title}</h3>
          <p className="mt-1 max-w-xl text-xs leading-4 text-slate-500">
            {description}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {images.length}/{MAX_GALLERY_IMAGES} fotos
        </span>
      </div>
      <div
        onDragOver={(event) => {
          if (enabled) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          submitFiles(event.dataTransfer.files);
        }}
        className={`mt-4 rounded-2xl border-2 border-dashed p-3 transition ${dragging ? "border-[#8f1519] bg-rose-50" : "border-slate-200 bg-slate-50"}`}
      >
        {enabled ? (
          <label
            htmlFor={inputId}
            className="grid min-h-28 cursor-pointer place-items-center rounded-xl px-4 text-center transition hover:bg-white"
          >
            <span>
              <span
                aria-hidden="true"
                className="mx-auto grid size-10 place-items-center rounded-full border border-[#8f1519]/25 bg-white text-xl font-semibold text-[#8f1519]"
              >
                +
              </span>
              <span className="mt-2 block text-sm font-bold text-slate-800">
                {uploading
                  ? "Subiendo fotos…"
                  : `Arrastra hasta ${remaining} foto${remaining === 1 ? "" : "s"}`}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                o haz clic para seleccionarlas. PNG, JPG o WEBP.
              </span>
            </span>
            <input
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event) => {
                submitFiles(event.target.files ?? []);
                event.currentTarget.value = "";
              }}
              className="sr-only"
            />
          </label>
        ) : (
          <div className="grid min-h-28 place-items-center px-4 text-center text-sm leading-5 text-slate-500">
            {disabledMessage ?? "Ya llegaste al máximo de tres fotos."}
          </div>
        )}
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
            {images.map((image, index) => (
              <div
                key={image.id ?? image.path}
                className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                {image.url ? (
                  <img
                    src={image.url}
                    alt={image.alt}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="grid size-full place-items-center text-xs text-slate-500">
                    Foto {index + 1}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  aria-label={`Quitar foto ${index + 1}`}
                  className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-white/95 text-base font-bold text-rose-700 shadow-sm"
                >
                  ×
                </button>
                {index === 0 && (
                  <span className="absolute bottom-1.5 left-1.5 rounded-md bg-slate-950/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    Portada
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
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
      const response = await fetch("/api/catalog/admin/products", {
        headers: { "X-Catalog-Admin-Key": password },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "No se pudo abrir el panel");
      }
      onAccess(password);
    } catch (error) {
      setState("idle");
      setMessage(
        error instanceof Error ? error.message : "No se pudo abrir el panel",
      );
    }
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-950 px-5">
      <form
        onSubmit={signIn}
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-white p-7 shadow-2xl"
      >
        <p className="text-xs font-bold tracking-[0.14em] text-[#9a2022]">
          CATÁLOGO TERRA
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          Panel privado
        </h1>
        <p className="mt-2 text-sm leading-5 text-slate-500">
          Escribe la clave de administrador para entrar directamente.
        </p>
        <label className="mt-6 block">
          <FieldLabel>Clave de administrador</FieldLabel>
          <TextInput
            value={password}
            onChange={setPassword}
            placeholder="admin"
            type="password"
          />
        </label>
        <button
          disabled={!password || state === "checking"}
          className="mt-5 min-h-12 w-full rounded-xl bg-[#8f1519] px-4 text-sm font-bold text-white transition hover:bg-[#741115] disabled:cursor-wait disabled:opacity-60"
        >
          {state === "checking" ? "Abriendo panel…" : "Entrar al panel"}
        </button>
        {message && (
          <p className="mt-4 text-sm leading-5 text-rose-700">{message}</p>
        )}
      </form>
    </main>
  );
}

function ProductEditor({
  product,
  onChange,
  onSave,
  onDelete,
  onCreateVariant,
  onOpenVariant,
  onUploadImages,
  saving,
  uploading,
}: {
  product: EditableProduct;
  onChange: (next: EditableProduct) => void;
  onSave: () => void;
  onDelete: () => void;
  onCreateVariant: () => void;
  onOpenVariant: (variant: EditableVariant) => void;
  onUploadImages: (files: File[]) => void;
  saving: boolean;
  uploading: boolean;
}) {
  const update = <K extends keyof EditableProduct>(
    field: K,
    value: EditableProduct[K],
  ) => onChange({ ...product, [field]: value });
  const previewUrl = product.slug || autoSlug(product.name);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-[#9a2022]">
            PRODUCTO PRINCIPAL
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            {product.name || "Nuevo producto"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            La información de esta ficha se comparte con todas sus variantes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="min-h-11 rounded-xl bg-[#8f1519] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#741115] disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar producto"}
          </button>
          {product.id && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `¿Eliminar definitivamente “${product.name}” y todas sus variantes?`,
                  )
                )
                  onDelete();
              }}
              className="min-h-11 rounded-xl border border-rose-300 px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-50"
            >
              Eliminar
            </button>
          )}
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <input
            checked={product.published}
            onChange={(event) => update("published", event.target.checked)}
            type="checkbox"
            className="mt-0.5 size-4 accent-[#8f1519]"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">
              Publicado
            </span>
            <span className="mt-0.5 block text-xs leading-4 text-slate-500">
              Visible para visitantes del catálogo.
            </span>
          </span>
        </label>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">URL automática</span>
          <br />/{previewUrl}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div>
          <h3 className="text-sm font-bold text-slate-950">
            Información del producto
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Esta ficha es la familia: categoría, descripción y detalles se
            comparten. Cada versión define su propio precio.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label>
            <FieldLabel>Nombre</FieldLabel>
            <TextInput
              value={product.name}
              onChange={(value) => update("name", value)}
            />
          </label>
          <label>
            <FieldLabel>Categoría</FieldLabel>
            <TextInput
              value={product.category}
              onChange={(value) => update("category", value)}
              placeholder="Colchones"
            />
          </label>
          <label>
            <FieldLabel>Precio de la versión principal (Bs)</FieldLabel>
            <TextInput
              type="number"
              value={product.priceFrom}
              onChange={(value) =>
                onChange({
                  ...product,
                  priceFrom: value,
                  variants: product.variants.map((variant) =>
                    variant.isPrimary ? { ...variant, price: value } : variant,
                  ),
                })
              }
              placeholder="Precio de salida"
            />
          </label>
        </div>
        <label className="mt-3 block">
          <FieldLabel>Descripción breve</FieldLabel>
          <textarea
            value={product.shortDescription}
            onChange={(event) => update("shortDescription", event.target.value)}
            rows={2}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-950 outline-none focus:border-[#8f1519] focus:ring-4 focus:ring-[#8f1519]/10"
          />
        </label>
        <label className="mt-3 block">
          <FieldLabel>Detalles técnicos</FieldLabel>
          <textarea
            value={product.specificationsText}
            onChange={(event) =>
              update("specificationsText", event.target.value)
            }
            placeholder="Un detalle por línea"
            rows={4}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-950 outline-none focus:border-[#8f1519] focus:ring-4 focus:ring-[#8f1519]/10"
          />
        </label>
      </section>
      <PhotoDropzone
        title="Fotos generales de respaldo"
        description="Opcionales. Cada versión tiene su propia galería; estas fotos solo aparecen cuando una versión no cargó las suyas."
        images={product.images}
        onUpload={onUploadImages}
        onRemove={(index) =>
          update(
            "images",
            product.images.filter((_, imageIndex) => imageIndex !== index),
          )
        }
        disabledMessage={
          !product.id
            ? "Guarda primero el producto para poder subir sus tres fotos."
            : undefined
        }
        uploading={uploading}
      />
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-950">Variantes</h3>
            <p className="mt-1 max-w-2xl text-xs leading-4 text-slate-500">
              Cada versión tiene nombre, enlace, precio, código, color y/o
              texto, además de su propia galería.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateVariant}
            disabled={!product.id}
            className="min-h-10 rounded-xl bg-[#8f1519] px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Crear versión
          </button>
        </div>
        {!product.id && (
          <p className="mt-3 text-xs text-slate-500">
            Al guardar se creará automáticamente la versión principal de esta
            familia.
          </p>
        )}
        <div className="mt-4 grid gap-2">
          {product.variants.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">
              Al guardar aparecerá aquí la versión principal. Después podrás
              añadir colores, plazas, modelos u otras versiones.
            </p>
          ) : (
            product.variants.map((variant) => (
              <button
                key={variant.id ?? `${variant.label}-${variant.sortOrder}`}
                type="button"
                onClick={() => onOpenVariant(variant)}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left transition hover:border-[#8f1519]/45 hover:bg-rose-50"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                    {variant.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {variant.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {variant.isPrimary ? "Versión principal · " : ""}
                      {variant.images.length}/3 fotos · Bs{" "}
                      {variant.price === "" ? "sin precio" : variant.price}
                      <br />/{variant.slug || "URL automática"}
                    </span>
                  </span>
                  {variant.colorHex && (
                    <span
                      className="size-5 shrink-0 rounded-full border border-slate-300"
                      style={{ backgroundColor: variant.colorHex }}
                      aria-label="Tiene punto de color"
                    />
                  )}
                </span>
                <span className="text-xs font-bold text-[#8f1519]">Editar</span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function VariantEditor({
  product,
  variant,
  onChange,
  onBack,
  onSave,
  onDelete,
  onDuplicate,
  onUploadImages,
  saving,
  uploading,
}: {
  product: EditableProduct;
  variant: EditableVariant;
  onChange: (next: EditableVariant) => void;
  onBack: () => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUploadImages: (files: File[]) => void;
  saving: boolean;
  uploading: boolean;
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-bold text-[#8f1519] hover:text-[#741115]"
      >
        ← Volver al producto
      </button>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-[#9a2022]">
            VARIANTE
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            {variant.id
              ? `Editar variante de ${product.name}`
              : `Nueva variante de ${product.name}`}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Esta versión tiene su propio enlace, nombre, precio, código y
            galería. Activa solo los selectores que correspondan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="min-h-11 rounded-xl bg-[#8f1519] px-5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar variante"}
          </button>
          {variant.id && (
            <button
              type="button"
              onClick={onDuplicate}
              className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Duplicar
            </button>
          )}
          {variant.id && !variant.isPrimary && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`¿Quitar la variante “${variant.label}”?`))
                  onDelete();
              }}
              className="min-h-11 rounded-xl border border-rose-300 px-4 text-sm font-bold text-rose-700 hover:bg-rose-50"
            >
              Quitar
            </button>
          )}
        </div>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-600"
          >
            i
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Datos heredados del producto principal
            </h3>
            <p className="mt-1 text-xs leading-4 text-slate-500">
              Categoría {product.category} · Descripción y detalles técnicos
              compartidos. El precio, las fotos y el enlace pertenecen a esta
              versión.
            </p>
          </div>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <FieldLabel>Nombre público de esta versión</FieldLabel>
            <TextInput
              value={variant.name}
              onChange={(value) =>
                onChange({
                  ...variant,
                  name: value,
                  slug: variant.id
                    ? variant.slug
                    : autoSlug(`${product.slug || product.name}-${value}`),
                })
              }
              placeholder="Ej. Prince 3P Almendra"
            />
          </label>
          <label>
            <FieldLabel>Enlace público</FieldLabel>
            <TextInput
              value={variant.slug}
              onChange={(value) =>
                onChange({ ...variant, slug: autoSlug(value) })
              }
              placeholder="prince-3p-almendra"
            />
          </label>
          <div>
            <FieldLabel>Color</FieldLabel>
            <div className="flex h-11 items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={variant.showColor}
                  onChange={(event) =>
                    onChange({
                      ...variant,
                      showColor: event.target.checked,
                      colorHex: event.target.checked
                        ? (variant.colorHex ?? "#1c1917")
                        : null,
                      colorName: event.target.checked
                        ? variant.colorName
                        : null,
                    })
                  }
                  className="accent-[#8f1519]"
                />{" "}
                Punto
              </label>
              {variant.showColor && variant.colorHex && (
                <label
                  className="relative size-10 cursor-pointer overflow-hidden rounded-full border border-slate-300"
                  style={{ backgroundColor: variant.colorHex }}
                  title="Cambiar color"
                >
                  <input
                    type="color"
                    value={variant.colorHex}
                    onChange={(event) =>
                      onChange({
                        ...variant,
                        colorHex: normalizeColorHex(event.target.value),
                      })
                    }
                    aria-label="Cambiar color de la variante"
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                </label>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label>
            <FieldLabel>Precio de esta versión (Bs)</FieldLabel>
            <TextInput
              type="number"
              value={variant.price}
              onChange={(value) => onChange({ ...variant, price: value })}
              placeholder="Ej. 3900"
            />
          </label>
          <label>
            <FieldLabel>Código externo</FieldLabel>
            <TextInput
              value={variant.externalCode ?? ""}
              onChange={(value) =>
                onChange({ ...variant, externalCode: value || null })
              }
              placeholder="Opcional"
            />
          </label>
          {variant.showColor && (
            <label>
              <FieldLabel>Nombre del color</FieldLabel>
              <TextInput
                value={variant.colorName ?? ""}
                onChange={(value) =>
                  onChange({ ...variant, colorName: value || null })
                }
                placeholder="Ej. Almendra"
              />
            </label>
          )}
          {variant.showOptionText && (
            <label>
              <FieldLabel>Texto de la variante</FieldLabel>
              <TextInput
                value={variant.label}
                onChange={(value) => onChange({ ...variant, label: value })}
                placeholder="Ej. 2 plazas, 3 puertas o con espejo"
              />
            </label>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-slate-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={variant.showOptionText}
              onChange={(event) =>
                onChange({ ...variant, showOptionText: event.target.checked })
              }
              className="accent-[#8f1519]"
            />
            Mostrar variante de texto
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={variant.active}
              onChange={(event) =>
                onChange({ ...variant, active: event.target.checked })
              }
              className="accent-[#8f1519]"
            />
            Disponible para elegir
          </label>
        </div>
      </section>
      <PhotoDropzone
        title="Fotos de esta variante"
        description="Opcionales, máximo tres. Si queda vacía, el cliente verá las fotos generales de respaldo de la familia."
        images={variant.images}
        onUpload={onUploadImages}
        onRemove={(index) =>
          onChange({
            ...variant,
            images: variant.images.filter(
              (_, imageIndex) => imageIndex !== index,
            ),
          })
        }
        disabledMessage={
          !variant.id
            ? "Guarda esta variante para poder subir sus tres fotos."
            : undefined
        }
        uploading={uploading}
      />
    </div>
  );
}

function CatalogHomeEditor({
  home,
  onChange,
  onSave,
  saving,
}: {
  home: CatalogHomeSettings;
  onChange: (next: CatalogHomeSettings) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="max-w-2xl space-y-5">
      <div className="border-b border-slate-200 pb-5">
        <p className="text-xs font-bold tracking-[0.12em] text-[#9a2022]">
          PORTADA PÚBLICA
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
          Mensaje principal
        </h2>
        <p className="mt-2 text-sm leading-5 text-slate-500">
          Este bloque aparece al inicio del catálogo público.
        </p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <label className="block">
          <FieldLabel>Etiqueta</FieldLabel>
          <TextInput
            value={home.eyebrow}
            onChange={(value) => onChange({ ...home, eyebrow: value })}
          />
        </label>
        <label className="mt-4 block">
          <FieldLabel>Título</FieldLabel>
          <TextInput
            value={home.title}
            onChange={(value) => onChange({ ...home, title: value })}
          />
        </label>
        <label className="mt-4 block">
          <FieldLabel>Descripción</FieldLabel>
          <textarea
            value={home.description}
            onChange={(event) =>
              onChange({ ...home, description: event.target.value })
            }
            rows={4}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-950 outline-none focus:border-[#8f1519] focus:ring-4 focus:ring-[#8f1519]/10"
          />
        </label>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="mt-5 min-h-11 rounded-xl bg-[#8f1519] px-5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar portada"}
        </button>
      </section>
    </div>
  );
}

function CatalogAdminDashboard({
  password,
  onLogout,
}: {
  password: string;
  onLogout: () => void;
}) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selected, setSelected] = useState<EditableProduct | null>(null);
  const [variantDraft, setVariantDraft] = useState<EditableVariant | null>(
    null,
  );
  const [home, setHome] = useState<CatalogHomeSettings | null>(null);
  const [section, setSection] = useState<"products" | "home">("products");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set("X-Catalog-Admin-Key", password);
      const response = await fetch(path, { ...init, headers });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "No se pudo completar la operación");
      return data;
    },
    [password],
  );
  const load = useCallback(async (): Promise<CatalogProduct[]> => {
    setLoading(true);
    try {
      const [productData, homeData] = await Promise.all([
        api("/api/catalog/admin/products"),
        api("/api/catalog/admin/home"),
      ]);
      const nextProducts = (productData as { products: CatalogProduct[] })
        .products;
      setProducts(nextProducts);
      setHome((homeData as { home: CatalogHomeSettings }).home);
      setSelected((current) => {
        if (!current)
          return nextProducts[0] ? editableProduct(nextProducts[0]) : null;
        if (!current.id) return current;
        const refreshed = nextProducts.find((item) => item.id === current.id);
        return refreshed
          ? editableProduct(refreshed)
          : nextProducts[0]
            ? editableProduct(nextProducts[0])
            : null;
      });
      return nextProducts;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el catálogo",
      );
      return [];
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function persistProduct(
    next: EditableProduct,
  ): Promise<EditableProduct> {
    const endpoint = next.id
      ? `/api/catalog/admin/products/${next.id}`
      : "/api/catalog/admin/products";
    const method = next.id ? "PATCH" : "POST";
    const result = (await api(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(next)),
    })) as { productId?: string };
    const refreshedProducts = await load();
    const savedId = next.id ?? result.productId;
    const saved = refreshedProducts.find((product) => product.id === savedId);
    if (!saved)
      throw new Error("El producto se guardó pero no se pudo recargar");
    const editable = editableProduct(saved);
    setSelected(editable);
    return editable;
  }
  async function saveProduct() {
    if (!selected) return;
    setSaving(true);
    setNotice(null);
    try {
      await persistProduct(selected);
      setNotice("Producto guardado.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el producto",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveVariant() {
    if (!selected || !variantDraft) return;
    setSaving(true);
    setNotice(null);
    try {
      const isNew = !variantDraft.id;
      const next = {
        ...selected,
        variants: isNew
          ? [...selected.variants, variantDraft]
          : selected.variants.map((variant) =>
              variant.id === variantDraft.id ? variantDraft : variant,
            ),
      };
      const saved = await persistProduct(next);
      const savedVariant = saved.variants.find(
        (variant) =>
          variant.id === variantDraft.id ||
          (isNew && variant.sortOrder === variantDraft.sortOrder),
      );
      if (!savedVariant)
        throw new Error("No se pudo encontrar la variante guardada");
      setVariantDraft(savedVariant);
      setNotice(
        isNew
          ? "Variante creada. Ahora puedes subir sus fotos."
          : "Variante guardada.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la variante",
      );
    } finally {
      setSaving(false);
    }
  }
  async function deleteProduct() {
    if (!selected?.id) return;
    setSaving(true);
    setNotice(null);
    try {
      await api(`/api/catalog/admin/products/${selected.id}`, {
        method: "DELETE",
      });
      setVariantDraft(null);
      const refreshedProducts = await load();
      setSelected(
        refreshedProducts[0] ? editableProduct(refreshedProducts[0]) : null,
      );
      setNotice("Producto eliminado.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el producto",
      );
    } finally {
      setSaving(false);
    }
  }
  async function deleteVariant() {
    if (!selected || !variantDraft?.id) return;
    setSaving(true);
    setNotice(null);
    try {
      await persistProduct({
        ...selected,
        variants: selected.variants.filter(
          (variant) => variant.id !== variantDraft.id,
        ),
      });
      setVariantDraft(null);
      setNotice("Variante quitada.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo quitar la variante",
      );
    } finally {
      setSaving(false);
    }
  }
  async function uploadProductImages(files: File[]) {
    if (!selected?.id || files.length === 0) return;
    setUploading(true);
    setNotice(null);
    try {
      let current = selected;
      for (const file of files.slice(
        0,
        MAX_GALLERY_IMAGES - current.images.length,
      )) {
        const form = new FormData();
        form.set("productId", current.id!);
        form.set("file", file);
        const result = (await api("/api/catalog/admin/images", {
          method: "POST",
          body: form,
        })) as { path: string; url: string };
        current = await persistProduct({
          ...current,
          images: [
            ...current.images,
            {
              path: result.path,
              url: result.url,
              alt: `${current.name} - imagen ${current.images.length + 1}`,
              sortOrder: current.images.length + 1,
            },
          ],
        });
      }
      setNotice("Fotos del producto guardadas.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudieron subir las fotos",
      );
    } finally {
      setUploading(false);
    }
  }
  async function uploadVariantImages(files: File[]) {
    if (!selected?.id || !variantDraft?.id || files.length === 0) return;
    setUploading(true);
    setNotice(null);
    try {
      let currentProduct = selected;
      let currentVariant = variantDraft;
      for (const file of files.slice(
        0,
        MAX_GALLERY_IMAGES - currentVariant.images.length,
      )) {
        const form = new FormData();
        form.set("productId", currentProduct.id!);
        form.set("variantId", currentVariant.id!);
        form.set("file", file);
        const result = (await api("/api/catalog/admin/variant-images", {
          method: "POST",
          body: form,
        })) as { path: string; url: string };
        const withImage = {
          ...currentVariant,
          images: [
            ...currentVariant.images,
            {
              path: result.path,
              url: result.url,
              alt: `${currentProduct.name} - ${currentVariant.label} - imagen ${currentVariant.images.length + 1}`,
              sortOrder: currentVariant.images.length + 1,
            },
          ],
        };
        currentProduct = await persistProduct({
          ...currentProduct,
          variants: currentProduct.variants.map((variant) =>
            variant.id === withImage.id ? withImage : variant,
          ),
        });
        currentVariant =
          currentProduct.variants.find(
            (variant) => variant.id === withImage.id,
          ) ?? withImage;
      }
      setVariantDraft(currentVariant);
      setNotice("Fotos de la variante guardadas.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudieron subir las fotos de la variante",
      );
    } finally {
      setUploading(false);
    }
  }
  async function saveHome() {
    if (!home) return;
    setSaving(true);
    setNotice(null);
    try {
      await api("/api/catalog/admin/home", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...home, imagePath: null }),
      });
      setNotice("Portada guardada.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la portada",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="min-h-dvh bg-[#f4f6f9] text-slate-900">
      <header className="border-b border-slate-200 bg-white/95 px-4 py-2.5">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <p className="text-xs font-bold tracking-[0.13em] text-[#9a2022]">
              TERRA
            </p>
            <h1 className="text-sm font-semibold text-slate-700">
              Administrador de catálogo
            </h1>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-500 hover:bg-slate-50"
          >
            Salir
          </button>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1440px] gap-4 p-3 lg:grid-cols-[232px_minmax(0,1fr)] lg:p-4">
        <aside className="self-start rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm lg:sticky lg:top-4">
          <button
            type="button"
            onClick={() => {
              setSection("products");
              setVariantDraft(null);
            }}
            className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${section === "products" ? "bg-[#8f1519] text-white" : "text-slate-700 hover:bg-slate-100"}`}
          >
            Productos
          </button>
          <button
            type="button"
            onClick={() => {
              setSection("home");
              setVariantDraft(null);
            }}
            className={`mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${section === "home" ? "bg-[#8f1519] text-white" : "text-slate-700 hover:bg-slate-100"}`}
          >
            Portada pública
          </button>
          {section === "products" && (
            <>
              <div className="my-3 border-t border-slate-100" />
              <button
                type="button"
                onClick={() => {
                  setSelected(blankProduct(products.length + 1));
                  setVariantDraft(null);
                }}
                className="w-full rounded-xl border border-dashed border-[#8f1519]/40 px-3 py-2.5 text-left text-sm font-bold text-[#8f1519] transition hover:bg-rose-50"
              >
                + Crear producto
              </button>
              <div className="mt-3 space-y-1">
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      setSelected(editableProduct(product));
                      setVariantDraft(null);
                    }}
                    className={`w-full rounded-xl px-3 py-2.5 text-left ${selected?.id === product.id && !variantDraft ? "bg-rose-50" : "hover:bg-slate-50"}`}
                  >
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {product.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {product.published ? "Publicado" : "Borrador"} ·{" "}
                      {availabilityLabel(product.availability)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {notice && (
            <p className="mb-5 rounded-xl bg-slate-100 px-3 py-2.5 text-sm text-slate-700">
              {notice}
            </p>
          )}
          {loading ? (
            <div className="grid min-h-80 place-items-center text-sm text-slate-500">
              Cargando catálogo…
            </div>
          ) : section === "home" && home ? (
            <CatalogHomeEditor
              home={home}
              onChange={setHome}
              onSave={() => void saveHome()}
              saving={saving}
            />
          ) : selected ? (
            variantDraft ? (
              <VariantEditor
                product={selected}
                variant={variantDraft}
                onChange={setVariantDraft}
                onBack={() => setVariantDraft(null)}
                onSave={() => void saveVariant()}
                onDelete={() => void deleteVariant()}
                onDuplicate={() =>
                  setVariantDraft(duplicateVariant(variantDraft))
                }
                onUploadImages={(files) => void uploadVariantImages(files)}
                saving={saving}
                uploading={uploading}
              />
            ) : (
              <ProductEditor
                product={selected}
                onChange={setSelected}
                onSave={() => void saveProduct()}
                onDelete={() => void deleteProduct()}
                onCreateVariant={() => setVariantDraft(blankVariant(selected))}
                onOpenVariant={(variant) =>
                  setVariantDraft({
                    ...variant,
                    images: variant.images.map((image) => ({ ...image })),
                  })
                }
                onUploadImages={(files) => void uploadProductImages(files)}
                saving={saving}
                uploading={uploading}
              />
            )
          ) : (
            <div className="grid min-h-80 place-items-center text-center">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">
                  Aún no hay productos.
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Crea el primero para comenzar a preparar el catálogo.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export function CatalogAdmin() {
  const [password, setPassword] = useState<string | null>(null);
  return password ? (
    <CatalogAdminDashboard
      password={password}
      onLogout={() => setPassword(null)}
    />
  ) : (
    <AdminLogin onAccess={setPassword} />
  );
}
