import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPublishedCatalogProductsForRag } from "@/lib/catalog-storefront/server";
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

export interface RagContext {
  context: string;
  sources: RetrievedSource[];
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

  const [knowledge, catalog] = await Promise.all([
    loadKnowledge(),
    getPublishedCatalogProductsForRag().catch((error) => {
      console.error("[rag] No se pudo consultar el catálogo para esta respuesta.", error);
      return [];
    }),
  ]);

  const sources = retrieveApprovedSources({
    query,
    products: catalog,
    knowledge,
    selectedLead: persistedLead ?? selectedCatalogLead(history),
  });
  return { context: formatRetrievedSources(sources), sources };
}
