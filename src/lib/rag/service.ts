import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  getCatalogServerClient,
  getPublishedCatalogProductsForRag,
  getPublishedCatalogProductsForRagIds,
  isCatalogConfigured,
} from "@/lib/catalog-storefront/server";
import { parseCatalogLeadContext } from "@/lib/catalog-storefront/whatsapp";
import type { Message } from "@/lib/db";
import {
  FALLBACK_KNOWLEDGE,
  formatRetrievedSources,
  parseKnowledgeBase,
  retrieveApprovedSources,
  type CatalogLeadReference,
  type KnowledgeChunk,
  type RetrievedSource,
} from "@/lib/rag/core";

const knowledgeFile = path.join(process.cwd(), "docs", "rag", "base-conocimiento-terra.md");
let knowledgePromise: Promise<KnowledgeChunk[]> | undefined;
let indexedSearchAvailable: boolean | undefined;

export interface RagContext {
  context: string;
  sources: RetrievedSource[];
}

interface IndexedChunk {
  id: string;
  sourceKind: "knowledge" | "catalog";
  catalogProductId: string | null;
  title: string;
  content: string;
  score: number;
}

async function loadKnowledge(): Promise<KnowledgeChunk[]> {
  knowledgePromise ??= readFile(knowledgeFile, "utf8")
    .then((document) => {
      const chunks = parseKnowledgeBase(document);
      if (chunks.length > 0) return chunks;
      console.error("[rag] La base de conocimiento no contiene secciones recuperables; se usa el respaldo seguro.");
      return FALLBACK_KNOWLEDGE;
    })
    .catch((error) => {
      console.error("[rag] No se pudo leer docs/rag/base-conocimiento-terra.md; se usa el respaldo seguro.", error);
      return FALLBACK_KNOWLEDGE;
    });
  return knowledgePromise;
}

function latestCustomerQuestion(history: Message[]): string | null {
  return [...history].reverse().find((message) => message.role === "user")?.content ?? null;
}

function selectedCatalogLead(history: Message[]): CatalogLeadReference | null {
  for (const message of [...history].reverse()) {
    if (message.role !== "user") continue;
    const lead = parseCatalogLeadContext(message.content);
    if (lead) return lead;
  }
  return null;
}

function indexedChunk(value: unknown): IndexedChunk | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const sourceKind = row.source_kind;
  const id = typeof row.id === "string" ? row.id : "";
  const title = typeof row.title === "string" ? row.title : "";
  const content = typeof row.content === "string" ? row.content : "";
  if (!id || !title || !content || (sourceKind !== "knowledge" && sourceKind !== "catalog")) return null;
  return {
    id,
    sourceKind,
    catalogProductId: typeof row.catalog_product_id === "string" ? row.catalog_product_id : null,
    title,
    content,
    score: typeof row.score === "number" ? row.score : Number(row.score) || 0,
  };
}

/**
 * Consulta el índice híbrido cuando la migración ya está disponible. Si una
 * instalación todavía no tiene la migración, el RAG actual queda operativo
 * con su recuperación léxica segura, sin interrumpir WhatsApp.
 */
async function searchIndexedKnowledge(query: string): Promise<IndexedChunk[] | null> {
  if (!isCatalogConfigured() || indexedSearchAvailable === false) return null;
  // Se activa después de desplegar las Edge Functions y el worker. Hasta ese
  // momento la misma RPC entrega FTS, sin depender de un proveedor externo.
  if (process.env.RAG_SEMANTIC_SEARCH_ENABLED === "true") {
    const semantic = await getCatalogServerClient().functions.invoke("rag-search", { body: { query } });
    if (!semantic.error && semantic.data && typeof semantic.data === "object") {
      const result = semantic.data as { results?: unknown };
      if (Array.isArray(result.results)) {
        indexedSearchAvailable = true;
        return result.results.map(indexedChunk).filter((item): item is IndexedChunk => item !== null);
      }
    }
    console.warn("[rag] La búsqueda semántica no está disponible; se usa FTS.");
  }
  const { data, error } = await getCatalogServerClient().rpc("match_terra_rag_chunks", {
    query_text: query,
    query_embedding: null,
    match_count: 8,
  });
  if (error) {
    const detail = error.message || "";
    if (/Could not find the function|relation .*rag_|schema cache/i.test(detail)) {
      indexedSearchAvailable = false;
      return null;
    }
    console.error("[rag] El índice híbrido no respondió; se usa la recuperación compatible.", error);
    return null;
  }
  indexedSearchAvailable = true;
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows.map(indexedChunk).filter((item): item is IndexedChunk => item !== null);
}

function sourceFromIndexedKnowledge(chunk: IndexedChunk): RetrievedSource {
  return {
    id: `knowledge-${chunk.id}`,
    kind: "knowledge",
    label: chunk.title,
    content: chunk.content,
    score: chunk.score,
  };
}

/**
 * Obtiene fuentes aprobadas para el último mensaje. No indexa ni reutiliza
 * conversaciones, pagos, comprobantes, ubicaciones ni otros datos privados.
 */
export async function buildRagContext(
  history: Message[],
  persistedLead: CatalogLeadReference | null = null,
): Promise<RagContext> {
  const query = latestCustomerQuestion(history);
  if (!query) return { context: "", sources: [] };

  const [knowledge, indexed] = await Promise.all([loadKnowledge(), searchIndexedKnowledge(query)]);
  const selectedLead = persistedLead ?? selectedCatalogLead(history);

  if (indexed) {
    const productIds = indexed
      .filter((item) => item.sourceKind === "catalog" && item.catalogProductId)
      .map((item) => item.catalogProductId!);
    if (selectedLead?.productId) productIds.push(selectedLead.productId);
    const catalog = await getPublishedCatalogProductsForRagIds(productIds);
    const catalogSources = retrieveApprovedSources({
      query,
      products: catalog,
      knowledge: [],
      selectedLead,
    }).filter((source) => source.kind === "catalog");
    const indexedKnowledge = indexed
      .filter((item) => item.sourceKind === "knowledge")
      .map(sourceFromIndexedKnowledge);

    // Mientras el operador migra la base Markdown inicial al panel, la fuente
    // existente continúa respaldando preguntas corporativas y de políticas.
    const legacyKnowledge = indexedKnowledge.length > 0
      ? []
      : retrieveApprovedSources({ query, products: [], knowledge, maxProducts: 0 });
    const sources = [...catalogSources, ...indexedKnowledge, ...legacyKnowledge];
    return { context: formatRetrievedSources(sources), sources };
  }

  const catalog = await getPublishedCatalogProductsForRag().catch((error) => {
    console.error("[rag] No se pudo consultar el catálogo para esta respuesta.", error);
    return [];
  });

  const sources = retrieveApprovedSources({
    query,
    products: catalog,
    knowledge,
    selectedLead,
  });
  return { context: formatRetrievedSources(sources), sources };
}
