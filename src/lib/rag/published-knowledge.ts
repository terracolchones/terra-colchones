import "server-only";

import { getCatalogServerClient, isCatalogConfigured } from "@/lib/catalog-storefront/server";
import { chunkKnowledgeContent } from "./chunking";
import type { KnowledgeChunk } from "./core";

export const PUBLISHED_KNOWLEDGE_CACHE_MS = 30_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
let cached: { chunks: KnowledgeChunk[]; expiresAt: number } | undefined;
let pending: Promise<KnowledgeChunk[]> | undefined;
let generation = 0;

/** Publishing invalidates this process immediately; other workers refresh within 30s. */
export function invalidatePublishedKnowledgeCache(): void {
  generation += 1;
  cached = undefined;
  pending = undefined;
}

async function readPublishedChunks(): Promise<KnowledgeChunk[]> {
  const chunks: KnowledgeChunk[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await getCatalogServerClient().from("rag_document_versions")
      .select("id,status,content")
      .eq("status", "published")
      .order("id", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error || !Array.isArray(data)) throw new Error("Published knowledge unavailable");
    for (const row of data) {
      // The query is publication-only; still reject malformed/unapproved rows.
      if (row.status !== "published" || typeof row.id !== "string" || typeof row.content !== "string") continue;
      if (!row.content.trim()) continue;
      // Document titles are shared with drafts, so only versioned content is safe.
      for (const [index, chunk] of chunkKnowledgeContent("Documento publicado", row.content).entries()) {
        chunks.push({ id: `published-${row.id}-${index}`, title: chunk.title, content: chunk.content });
      }
    }
    if (data.length < PAGE_SIZE) return chunks;
  }
  // Do not silently represent a partial inventory as complete.
  throw new Error("Published knowledge inventory exceeds retrieval limit");
}

/** Secondary lexical source when the search index cannot provide useful knowledge. */
export function getPublishedKnowledgeChunks(): Promise<KnowledgeChunk[]> {
  if (!isCatalogConfigured()) return Promise.resolve([]);
  if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.chunks);
  if (pending) return pending;
  const requestGeneration = generation;
  const request = readPublishedChunks()
    .then((chunks) => {
      if (generation === requestGeneration) cached = { chunks, expiresAt: Date.now() + PUBLISHED_KNOWLEDGE_CACHE_MS };
      return chunks;
    })
    .catch(() => {
      // Do not reuse an expired approval cache or expose database/provider errors.
      if (generation === requestGeneration) cached = undefined;
      console.warn("[rag] No se pudo recuperar el conocimiento publicado; no se usarán documentos sin verificar.");
      return [];
    })
    .finally(() => { if (pending === request) pending = undefined; });
  pending = request;
  return request;
}
