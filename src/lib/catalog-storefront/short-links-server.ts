import "server-only";

import { randomInt } from "node:crypto";
import { cache } from "react";
import { CatalogRequestError } from "./admin-server";
import { getCatalogServerClient, getProductForCatalogLead, getPublishedCatalogEntryBySlug, isCatalogConfigured } from "./server";
import { parseProductLink, publicShortLink, SHORT_CODE_ALPHABET, SHORT_CODE_PATTERN, ShortLinkInputError, type SavedCatalogShortLink } from "./short-links";

function storageError(): CatalogRequestError {
  return new CatalogRequestError("No se pudo acceder al acortador. Comprueba que su almacenamiento esté habilitado e inténtalo de nuevo.", 503);
}

function newCode(length: number): string {
  let code = String(randomInt(2, 10));
  while (code.length < length) code += SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)];
  return code;
}

export async function createProductShortLink(input: unknown) {
  let slug: string;
  try {
    slug = parseProductLink(input);
  } catch (error) {
    if (error instanceof ShortLinkInputError) throw new CatalogRequestError(error.message);
    throw error;
  }
  if (!isCatalogConfigured()) throw storageError();
  const entry = await getPublishedCatalogEntryBySlug(slug);
  if (!entry) throw new CatalogRequestError("No se encontró un producto publicado con ese enlace.", 404);
  const { product, selectedVariantId } = entry;
  const variant = product.variants.find((item) => item.id === selectedVariantId);
  const target = { name: variant?.name || product.name, slug: variant?.slug || product.slug };
  const targetKind = selectedVariantId ? "variant" : "product";
  const client = getCatalogServerClient();

  // La restricción UNIQUE decide también cuando dos solicitudes llegan juntas.
  // Tras colisiones repetidas se amplía el código sin modificar los ya emitidos.
  for (let attempt = 0; attempt < 36; attempt++) {
    let query = client.from("catalog_short_links").select("code").eq("product_id", product.id).eq("target_kind", targetKind);
    if (selectedVariantId) query = query.eq("variant_id", selectedVariantId);
    const existing = await query.maybeSingle();
    if (existing.error) throw storageError();
    if (existing.data) return { link: publicShortLink(existing.data.code, target), created: false };

    const code = newCode(3 + Math.floor(attempt / 12));
    const result = await client.from("catalog_short_links").insert({ code, product_id: product.id, variant_id: selectedVariantId, target_kind: targetKind });
    if (!result.error) return { link: publicShortLink(code, target), created: true };
    if (result.error.code !== "23505") throw storageError();
  }
  throw new CatalogRequestError("No se pudo reservar un código. Vuelve a intentarlo.", 503);
}

// La ficha y sus metadatos comparten la consulta dentro del mismo render.
export const getEntryByShortCode = cache(async (code: string) => {
  if (!SHORT_CODE_PATTERN.test(code) || !isCatalogConfigured()) return null;
  const result = await getCatalogServerClient().from("catalog_short_links").select("product_id, variant_id, target_kind").eq("code", code).maybeSingle();
  if (result.error) throw storageError();
  if (!result.data?.product_id) return null;
  // Se resuelve por identidad, no por slug, y se vuelve a comprobar publicación.
  if (result.data.target_kind === "variant" && !result.data.variant_id) return null;
  const resolved = await getProductForCatalogLead(result.data.product_id, result.data.variant_id);
  if (!resolved || (result.data.target_kind === "variant" && !resolved.variant)) return null;
  const active = resolved.product.variants.filter((variant) => variant.active);
  const selected = resolved.variant ?? active.find((variant) => variant.isPrimary) ?? active[0];
  return { product: resolved.product, selectedVariantId: selected?.id ?? null };
});

export async function listProductShortLinks(page: number) {
  if (!Number.isInteger(page) || page < 0 || page > 100000) throw new CatalogRequestError("La página no es válida.");
  const size = 30;
  const result = await getCatalogServerClient().from("catalog_short_links")
    .select("code, created_at, target_kind, product:catalog_products(name, slug, published), variant:catalog_variants(name, slug, active)")
    .not("product_id", "is", null).order("created_at", { ascending: false }).order("code", { ascending: false })
    .range(page * size, page * size + size);
  if (result.error) throw storageError();
  const rows = (result.data ?? []) as unknown as Array<{
    code: string; created_at: string; target_kind: string;
    product: { name: string; slug: string; published: boolean } | null;
    variant: { name: string; slug: string; active: boolean } | null;
  }>;
  const links: SavedCatalogShortLink[] = rows.slice(0, size).map((row) => {
    const target = row.target_kind === "variant" ? row.variant : row.product;
    return {
      ...publicShortLink(row.code, { name: target?.name || row.product?.name || "Producto no disponible", slug: target?.slug || row.product?.slug || "" }),
      createdAt: row.created_at,
      available: Boolean(row.product?.published && (row.target_kind === "product" || row.variant?.active)),
    };
  });
  return { links, hasMore: rows.length > size };
}

export async function removeProductShortLink(code: string) {
  if (!SHORT_CODE_PATTERN.test(code)) throw new CatalogRequestError("El código no es válido.");
  // Reservar siempre el código retirado; no se elimina ni cambia el producto.
  const result = await getCatalogServerClient().from("catalog_short_links")
    .update({ product_id: null, variant_id: null }).eq("code", code);
  if (result.error) throw storageError();
}
