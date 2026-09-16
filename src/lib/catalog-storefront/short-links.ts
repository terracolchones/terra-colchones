export const CATALOG_PUBLIC_ORIGIN = "https://terracolchonesymuebles.online";

// Un dígito inicial separa este espacio de las rutas con nombre del catálogo.
export const SHORT_CODE_PATTERN = /^[2-9][a-hj-km-np-z2-9]{2,7}$/;
export const SHORT_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export interface CatalogShortLink {
  code: string;
  shortUrl: string;
  productUrl: string;
  productName: string;
}

export class ShortLinkInputError extends Error {}

export interface SavedCatalogShortLink extends CatalogShortLink {
  createdAt: string;
  available: boolean;
}

export function parseProductLink(input: unknown): string {
  if (typeof input !== "string" || !input.trim() || input.length > 2048) {
    throw new ShortLinkInputError("Pega el enlace del producto que quieres acortar.");
  }
  const value = input.trim();
  if (/[\\\s]/.test(value)) throw new ShortLinkInputError("El enlace no es válido.");
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new ShortLinkInputError("El enlace no es válido.");
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port ||
      ![new URL(CATALOG_PUBLIC_ORIGIN).hostname, `www.${new URL(CATALOG_PUBLIC_ORIGIN).hostname}`].includes(url.hostname)) {
    throw new ShortLinkInputError("Usa un enlace de producto de terracolchonesymuebles.online.");
  }
  // Solo se descartan etiquetas publicitarias. Nunca guardar tokens privados de compra.
  for (const key of url.searchParams.keys()) {
    if (!/^utm_[a-z_]+$/.test(key) && !["fbclid", "gclid"].includes(key)) {
      throw new ShortLinkInputError("Pega el enlace público del producto, sin parámetros privados ni de compra.");
    }
  }
  if (url.hash) throw new ShortLinkInputError("Pega el enlace del producto sin la parte que empieza con #.");
  const match = /^\/catalogo\/productos\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(url.pathname);
  if (!match) {
    throw new ShortLinkInputError("El enlace debe abrir una ficha de producto del catálogo.");
  }
  return match[1];
}

export function publicShortLink(code: string, product: { slug: string; name: string }): CatalogShortLink {
  return {
    code,
    shortUrl: `${CATALOG_PUBLIC_ORIGIN}/${code}`,
    productUrl: `${CATALOG_PUBLIC_ORIGIN}/catalogo/productos/${product.slug}`,
    productName: product.name,
  };
}
