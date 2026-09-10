import type { CatalogProduct, CatalogVariant } from "../catalog-storefront/types";
import { isColorVariant } from "../catalog-storefront/color-variants";

export interface KnowledgeChunk {
  id: string;
  title: string;
  content: string;
}

export interface CatalogLeadReference {
  productId: string;
  variantId: string | null;
}

export interface RetrievedSource {
  id: string;
  kind: "catalog" | "knowledge";
  label: string;
  content: string;
  score: number;
}

export interface RetrievalInput {
  query: string;
  products: CatalogProduct[];
  knowledge: KnowledgeChunk[];
  selectedLead?: CatalogLeadReference | null;
  maxProducts?: number;
  maxKnowledge?: number;
}

const IGNORED_KNOWLEDGE_SECTIONS = new Set([
  "datos que se deben cargar despues",
  "fuentes internas actuales",
]);

const STOP_WORDS = new Set([
  "a", "al", "algo", "ante", "con", "como", "cual", "cuales", "de", "del", "donde", "el", "en", "es", "esta", "este", "hacen", "hay", "la", "las", "lo", "los", "me", "mi", "necesito", "para", "por", "que", "quiero", "se", "si", "son", "su", "sus", "te", "tiene", "tienen", "un", "una", "unos", "unas", "y", "ya",
]);

const TERM_GROUPS = [
  ["precio", "precios", "cuanto", "cuesta", "vale", "costo", "cotizacion"],
  ["stock", "disponible", "disponibilidad", "existencia", "hay"],
  ["entrega", "entregas", "envio", "envios", "despacho", "ciudad", "bolivia", "santa", "cruz"],
  ["garantia", "garantias", "devolucion", "devoluciones", "cambio", "cambios"],
  ["pago", "pagos", "comprobante", "transferencia", "qr"],
  ["medida", "medidas", "tamano", "dimensiones", "especificacion", "especificaciones"],
  ["color", "colores", "variante", "variantes", "modelo", "modelos"],
];

/** Respaldo seguro cuando el documento editable no llegó al despliegue. */
export const FALLBACK_KNOWLEDGE: KnowledgeChunk[] = [
  {
    id: "reglas-comerciales",
    title: "Reglas comerciales aprobadas",
    content: "Responde solo con información del catálogo publicado o de fuentes comerciales aprobadas. Si falta un dato, indica que un asesor lo confirmará. Nunca inventes precios, stock, plazos, garantías, promociones ni políticas.",
  },
  {
    id: "entrega",
    title: "Entrega",
    content: "Terra realiza entregas en Santa Cruz y envíos a Bolivia. La cobertura exacta, fecha y costo de entrega deben confirmarse con un asesor cuando no estén documentados en una ficha aprobada.",
  },
  {
    id: "pagos",
    title: "Pagos y comprobantes",
    content: "Un comprobante queda en revisión por un asesor. El agente no confirma pagos, no solicita GPS ni datos bancarios, y no crea ni modifica códigos QR.",
  },
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");
}

function uniqueTokens(value: string): string[] {
  const tokens = normalize(value).match(/[a-z0-9]{2,}/g) ?? [];
  return [...new Set(tokens.filter((token) => !STOP_WORDS.has(token)))];
}

function expandedQueryTokens(value: string): string[] {
  const terms = new Set(uniqueTokens(value));
  for (const group of TERM_GROUPS) {
    if (group.some((term) => terms.has(term))) {
      for (const term of group) terms.add(term);
    }
  }
  return [...terms];
}

function tokensMatch(left: string, right: string): boolean {
  return left === right
    || (left.length >= 4 && right.length >= 4 && (left.startsWith(right) || right.startsWith(left)));
}

function scoreText(queryTokens: string[], text: string): number {
  const textTokens = uniqueTokens(text);
  return queryTokens.reduce(
    (score, queryToken) => score + (textTokens.some((textToken) => tokensMatch(queryToken, textToken)) ? 1 : 0),
    0,
  );
}

function slug(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "seccion";
}

function withoutFrontMatter(markdown: string): string {
  return markdown.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/, "");
}

/** Convierte cada sección ## del documento en una fuente recuperable. */
export function parseKnowledgeBase(markdown: string): KnowledgeChunk[] {
  const document = withoutFrontMatter(markdown);
  const headings = [...document.matchAll(/^##\s+(.+?)\s*$/gm)];

  return headings.flatMap((heading, index) => {
    const title = heading[1]?.trim() ?? "";
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? document.length;
    const content = document.slice(start, end).trim();
    if (!title || !content || IGNORED_KNOWLEDGE_SECTIONS.has(normalize(title))) return [];
    return [{ id: `kb-${slug(title)}`, title, content }];
  });
}

function availabilityLabel(value: CatalogProduct["availability"]): string {
  if (value === "available") return "Disponible";
  if (value === "out_of_stock") return "Sin stock";
  return "Próximamente";
}

function formatPrice(value: number | null): string | null {
  if (value === null) return null;
  return `Bs ${new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 }).format(value)}`;
}

function catalogSearchText(product: CatalogProduct): string {
  return [
    product.name,
    product.category,
    product.shortDescription,
    product.description,
    ...product.specifications,
    ...product.variants.filter((variant) => variant.active && !isColorVariant(variant)).flatMap((variant) => [variant.label, variant.externalCode ?? ""]),
  ].join(" ");
}

function selectedVariant(product: CatalogProduct, lead: CatalogLeadReference | null | undefined): CatalogVariant | null {
  if (!lead?.variantId) return null;
  return product.variants.find((variant) => variant.id === lead.variantId && variant.active) ?? null;
}

function formatCatalogProduct(product: CatalogProduct, variant: CatalogVariant | null): string {
  const lines = [
    `Nombre: ${product.name}`,
    `Categoría: ${product.category}`,
    `Disponibilidad: ${availabilityLabel(product.availability)}`,
  ];

  // Una variante elegida puede tener precio o disponibilidad distinta del
  // producto base. No usar el precio "desde" del producto como sustituto: eso
  // podría comunicar un monto que no corresponde a la selección del cliente.
  const price = formatPrice(variant ? variant.price : product.priceFrom);
  if (price) lines.push(`Precio vigente: ${price}`);
  if (variant) {
    lines.push(`Variante seleccionada: ${variant.label}`);
    lines.push(`Disponibilidad de la variante seleccionada: ${availabilityLabel(variant.availability)}`);
    if (!price) lines.push("Precio de la variante seleccionada: sin precio publicado.");
  }
  if (product.shortDescription) lines.push(`Descripción corta: ${product.shortDescription}`);
  if (product.description) lines.push(`Descripción: ${product.description}`);
  if (product.specifications.length > 0) lines.push(`Especificaciones: ${product.specifications.join("; ")}`);

  const activeVariants = product.variants.filter((item) => item.active && !isColorVariant(item));
  if (activeVariants.length > 0) {
    const labels = activeVariants.map((item) => {
      const variantPrice = formatPrice(item.price);
      return variantPrice ? `${item.label} (${variantPrice})` : item.label;
    });
    lines.push(`Variantes activas: ${labels.join(", ")}`);
  }

  return lines.join("\n");
}

function cap(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1).trimEnd()}…`;
}

/**
 * Recupera únicamente productos publicados y secciones de conocimiento
 * relevantes. Los datos de precio/stock se leen del catálogo en cada consulta.
 */
export function retrieveApprovedSources({
  query,
  products,
  knowledge,
  selectedLead = null,
  maxProducts = 2,
  maxKnowledge = 3,
}: RetrievalInput): RetrievedSource[] {
  const queryTokens = expandedQueryTokens(query);
  if (queryTokens.length === 0) return [];

  const publishedProducts = products.filter((product) => product.published);
  const selectedProduct = selectedLead
    ? publishedProducts.find((product) => product.id === selectedLead.productId) ?? null
    : null;

  const catalogSources: RetrievedSource[] = [];
  if (selectedProduct) {
    catalogSources.push({
      id: `catalog-${selectedProduct.id}`,
      kind: "catalog",
      label: selectedProduct.name,
      content: cap(formatCatalogProduct(selectedProduct, selectedVariant(selectedProduct, selectedLead)), 2_400),
      score: Number.MAX_SAFE_INTEGER,
    });
  }

  const matchingProducts = publishedProducts
    .filter((product) => product.id !== selectedProduct?.id)
    .map((product) => ({ product, score: scoreText(queryTokens, catalogSearchText(product)) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name, "es"))
    .slice(0, Math.max(0, maxProducts - catalogSources.length));

  for (const candidate of matchingProducts) {
    catalogSources.push({
      id: `catalog-${candidate.product.id}`,
      kind: "catalog",
      label: candidate.product.name,
      content: cap(formatCatalogProduct(candidate.product, null), 2_400),
      score: candidate.score,
    });
  }

  const knowledgeSources = knowledge
    .map((chunk) => ({ chunk, score: scoreText(queryTokens, `${chunk.title}\n${chunk.content}`) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.title.localeCompare(right.chunk.title, "es"))
    .slice(0, maxKnowledge)
    .map(({ chunk, score }) => ({
      id: chunk.id,
      kind: "knowledge" as const,
      label: chunk.title,
      content: cap(chunk.content, 1_800),
      score,
    }));

  return [...catalogSources, ...knowledgeSources];
}

export function formatRetrievedSources(sources: RetrievedSource[]): string {
  return sources
    .map((source) => {
      const heading = source.kind === "catalog" ? "CATÁLOGO VIGENTE" : "BASE DE CONOCIMIENTO CONFIGURADA";
      return `[${heading}: ${source.label}]\n${source.content}`;
    })
    .join("\n\n");
}
