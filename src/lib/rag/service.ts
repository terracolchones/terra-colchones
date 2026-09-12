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
import { getPublishedKnowledgeChunks } from "@/lib/rag/published-knowledge";
import { buildPublicDirectoryReply, hasOtherCommerceQuestion, shouldRetrievePublicDirectory, type DirectoryReply } from "@/lib/rag/public-contacts";

const knowledgeFile = path.join(process.cwd(), "docs", "rag", "base-conocimiento-terra.md");
let knowledgePromise: Promise<KnowledgeChunk[]> | undefined;
const INDEX_RETRY_COOLDOWN_MS = 30_000;
let indexedSearchRetryAfter = 0;
let semanticSearchRetryAfter = 0;

export interface RagContext {
  context: string;
  sources: RetrievedSource[];
  directoryReply?: string;
  contactEvidence?: string;
  requiredBranchBlocks?: string[];
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
      const metadata = document.replace(/^\uFEFF/, "").match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
      if (metadata && /^\s*estado\s*:\s*["']?borrador["']?\s*(?:#.*)?$/im.test(metadata)) {
        console.warn("[rag] La base local está en borrador; se utiliza únicamente el respaldo seguro.");
        return FALLBACK_KNOWLEDGE;
      }
      const chunks = parseKnowledgeBase(document);
      if (chunks.length > 0) return chunks;
      console.error("[rag] La base de conocimiento no contiene secciones recuperables; se usa el respaldo seguro.");
      return FALLBACK_KNOWLEDGE;
    })
    .catch(() => {
      console.error("[rag] No se pudo leer la base local de conocimiento; se usa el respaldo seguro.");
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
async function searchIndexedKnowledge(query: string): Promise<{ chunks: IndexedChunk[]; mode: "semantic" | "fts" } | null> {
  if (!isCatalogConfigured()) return null;
  // Se activa después de desplegar las Edge Functions y el worker. Hasta ese
  // momento la misma RPC entrega FTS, sin depender de un proveedor externo.
  if (process.env.RAG_SEMANTIC_SEARCH_ENABLED === "true" && Date.now() >= semanticSearchRetryAfter) {
    const semantic = await getCatalogServerClient().functions.invoke("rag-search", { body: { query } })
      .catch(() => ({ error: true, data: null }));
    if (!semantic.error && semantic.data && typeof semantic.data === "object") {
      const result = semantic.data as { results?: unknown };
      if (Array.isArray(result.results)) {
        semanticSearchRetryAfter = 0;
        return { mode: "semantic", chunks: result.results.map(indexedChunk).filter((item): item is IndexedChunk => item !== null) };
      }
    }
    semanticSearchRetryAfter = Date.now() + INDEX_RETRY_COOLDOWN_MS;
    console.warn("[rag] La búsqueda semántica no está disponible; se usa FTS.");
  }
  // A healthy FTS response must not trigger another failing semantic request.
  if (Date.now() < indexedSearchRetryAfter) return null;
  try {
    const { data, error } = await getCatalogServerClient().rpc("match_terra_rag_chunks", {
      query_text: query,
      query_embedding: null,
      match_count: 8,
    });
    if (error) {
      indexedSearchRetryAfter = Date.now() + INDEX_RETRY_COOLDOWN_MS;
      console.warn("[rag] El índice no está disponible; se usa la recuperación compatible y se volverá a intentar.");
      return null;
    }
    indexedSearchRetryAfter = 0;
    const rows: unknown[] = Array.isArray(data) ? data : [];
    return { mode: "fts", chunks: rows.map(indexedChunk).filter((item): item is IndexedChunk => item !== null) };
  } catch {
    indexedSearchRetryAfter = Date.now() + INDEX_RETRY_COOLDOWN_MS;
    console.warn("[rag] La búsqueda no pudo completarse; se usa la recuperación compatible y se volverá a intentar.");
    return null;
  }
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

async function secondaryKnowledge(query: string, legacy: KnowledgeChunk[]): Promise<RetrievedSource[]> {
  const published = retrieveApprovedSources({
    query, products: [], knowledge: await getPublishedKnowledgeChunks(), maxProducts: 0,
  });
  return published.length > 0 ? published : retrieveApprovedSources({ query, products: [], knowledge: legacy, maxProducts: 0 });
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

  let mixedDirectory: DirectoryReply | undefined;
  if (shouldRetrievePublicDirectory(history)) {
    const directory = buildPublicDirectoryReply(history, await getPublishedKnowledgeChunks({ fresh: true, wholeDocuments: true }));
    if (directory && !hasOtherCommerceQuestion(query)) return { context: formatRetrievedSources(directory.sources), sources: directory.sources, directoryReply: directory.content };
    if (directory) mixedDirectory = directory;
  }

  const finish = (input: RetrievedSource[]): RagContext => {
    // Mixed questions retain normal product/policy retrieval, but the phone directory has one current authority.
    const sources = mixedDirectory ? [...input.map((source) => source.kind !== "knowledge" ? source : {
      ...source,
      // The same approved document may also contain payment/shipping policies.
      // Remove indexed phone fields while retaining that independently useful evidence.
      content: source.content.split(/\r?\n/).filter((line) => !/^\s*[-*•]?\s*[\p{L}][\p{L} .'-]{0,59}:\s*\+?\d[\d ().-]{6,}/u.test(line)
        && !(mixedDirectory?.branchBlocks?.length && /^\s*[-*•]?\s*(?:ubicaci[oó]n|mapa):/i.test(line))).join("\n").trim(),
    }).filter((source) => source.content), ...mixedDirectory.sources] : input;
    return { context: formatRetrievedSources(sources), sources, ...(mixedDirectory ? { contactEvidence: mixedDirectory.content,
      ...(mixedDirectory.branchBlocks?.length ? { requiredBranchBlocks: mixedDirectory.branchBlocks } : {}) } : {}) };
  };

  const [knowledge, indexed] = await Promise.all([loadKnowledge(), searchIndexedKnowledge(query)]);
  const selectedLead = persistedLead ?? selectedCatalogLead(history);

  if (indexed) {
    const productIds = indexed.chunks
      .filter((item) => item.sourceKind === "catalog" && item.catalogProductId)
      .map((item) => item.catalogProductId!);
    if (selectedLead?.productId) productIds.push(selectedLead.productId);
    const catalog = await getPublishedCatalogProductsForRagIds(productIds);
    let catalogSources = retrieveApprovedSources({
      query,
      products: catalog,
      knowledge: [],
      selectedLead,
    }).filter((source) => source.kind === "catalog");
    if (catalogSources.length === 0) {
      // A healthy index with zero hits must not hide published catalog products.
      const lexicalCatalog = await getPublishedCatalogProductsForRag().catch(() => []);
      catalogSources = retrieveApprovedSources({ query, products: lexicalCatalog, knowledge: [], selectedLead })
        .filter((source) => source.kind === "catalog");
    }
    const indexedKnowledgeCandidates = indexed.chunks
      .filter((item) => item.sourceKind === "knowledge")
      .map(sourceFromIndexedKnowledge);
    const relevantIds = new Set(retrieveApprovedSources({
      query, products: [], knowledge: indexedKnowledgeCandidates.map((source) => ({ id: source.id, title: source.label, content: source.content })),
      maxProducts: 0,
    }).map((source) => source.id));
    // Semantic search intentionally matches paraphrases without shared words.
    const indexedKnowledge = indexed.mode === "semantic" ? indexedKnowledgeCandidates
      : indexedKnowledgeCandidates.filter((source) => relevantIds.has(source.id));

    // Prefer current published documents before the legacy Markdown fallback.
    const fallbackKnowledge = indexedKnowledge.length > 0
      ? []
      : await secondaryKnowledge(query, knowledge);
    const sources = [...catalogSources, ...indexedKnowledge, ...fallbackKnowledge];
    return finish(sources);
  }

  const catalog = await getPublishedCatalogProductsForRag().catch(() => {
    console.error("[rag] No se pudo consultar el catálogo para esta respuesta.");
    return [];
  });

  const catalogSources = retrieveApprovedSources({
    query,
    products: catalog,
    knowledge: [],
    selectedLead,
  });
  const sources = [...catalogSources, ...await secondaryKnowledge(query, knowledge)];
  return finish(sources);
}
