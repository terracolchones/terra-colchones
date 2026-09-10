import "server-only";

import { getCatalogServerClient, isCatalogConfigured } from "@/lib/catalog-storefront/server";
import { chunkKnowledgeContent } from "@/lib/rag/chunking";
import {
  KNOWLEDGE_KINDS,
  type KnowledgeDocumentSummary,
  type KnowledgeDraftInput,
  type KnowledgeKind,
  type KnowledgeVersionStatus,
} from "@/lib/rag/knowledge-types";

export class KnowledgeServiceError extends Error {}

const kindSet = new Set<string>(KNOWLEDGE_KINDS);

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableText(value: unknown): string | null {
  const text = asText(value).trim();
  return text || null;
}

function asTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asStatus(value: unknown): KnowledgeVersionStatus {
  return value === "published" || value === "archived" ? value : "draft";
}

function ensureConfigured(): void {
  if (!isCatalogConfigured()) throw new KnowledgeServiceError("La base de conocimiento todavía no está configurada.");
}

function serviceError(error: unknown, fallback: string): KnowledgeServiceError {
  const detail = error instanceof Error ? error.message : String(error);
  if (/Could not find the table|relation .*rag_|schema cache/i.test(detail)) {
    return new KnowledgeServiceError("La migración de la base de conocimiento aún no fue aplicada.");
  }
  return new KnowledgeServiceError(fallback);
}

function validateDraft(input: KnowledgeDraftInput): KnowledgeDraftInput {
  const title = input.title.trim();
  const content = input.content.trim();
  const tags = [...new Set(input.tags.map((tag) => tag.trim().toLocaleLowerCase("es")).filter((tag) => tag.length > 0 && tag.length <= 40))].slice(0, 12);
  const catalogProductId = input.catalogProductId?.trim() || null;
  const catalogCategory = input.catalogCategory?.trim() || null;
  if (!title || title.length > 140) throw new KnowledgeServiceError("El título debe tener entre 1 y 140 caracteres.");
  if (!kindSet.has(input.kind)) throw new KnowledgeServiceError("El tipo de conocimiento no es válido.");
  if (!content || content.length > 15_000) throw new KnowledgeServiceError("El contenido debe tener entre 1 y 15.000 caracteres.");
  if (catalogCategory && catalogCategory.length > 80) throw new KnowledgeServiceError("La categoría vinculada es demasiado larga.");
  return { title, kind: input.kind, tags, catalogProductId, catalogCategory, content };
}

function currentVersion(rows: Array<Record<string, unknown>>): KnowledgeDocumentSummary["currentVersion"] {
  const priority: Record<KnowledgeVersionStatus, number> = { draft: 3, published: 2, archived: 1 };
  const selected = rows.sort((left, right) => {
    const byStatus = priority[asStatus(right.status)] - priority[asStatus(left.status)];
    return byStatus || Number(right.revision) - Number(left.revision);
  })[0];
  if (!selected) return null;
  return {
    id: asText(selected.id),
    revision: Number(selected.revision) || 1,
    status: asStatus(selected.status),
    content: asText(selected.content),
    updatedAt: asText(selected.updated_at),
    publishedAt: asNullableText(selected.published_at),
  };
}

export async function listKnowledgeDocuments(): Promise<KnowledgeDocumentSummary[]> {
  ensureConfigured();
  const client = getCatalogServerClient();
  const { data: documents, error: documentsError } = await client
    .from("rag_documents")
    .select("id, title, kind, tags, catalog_product_id, catalog_category, updated_at")
    .order("updated_at", { ascending: false });
  if (documentsError) throw serviceError(documentsError, "No se pudo leer la base de conocimiento.");
  const ids = (documents ?? []).map((document) => String(document.id));
  if (ids.length === 0) return [];

  const { data: versions, error: versionsError } = await client
    .from("rag_document_versions")
    .select("id, document_id, revision, content, status, updated_at, published_at")
    .in("document_id", ids)
    .order("revision", { ascending: false });
  if (versionsError) throw serviceError(versionsError, "No se pudieron leer las versiones de conocimiento.");

  const versionsByDocument = new Map<string, Array<Record<string, unknown>>>();
  for (const version of versions ?? []) {
    const row = version as Record<string, unknown>;
    const documentId = asText(row.document_id);
    versionsByDocument.set(documentId, [...(versionsByDocument.get(documentId) ?? []), row]);
  }

  return (documents ?? []).map((document) => {
    const row = document as Record<string, unknown>;
    return {
      id: asText(row.id),
      title: asText(row.title),
      kind: (kindSet.has(asText(row.kind)) ? asText(row.kind) : "company") as KnowledgeKind,
      tags: asTags(row.tags),
      catalogProductId: asNullableText(row.catalog_product_id),
      catalogCategory: asNullableText(row.catalog_category),
      updatedAt: asText(row.updated_at),
      currentVersion: currentVersion(versionsByDocument.get(asText(row.id)) ?? []),
    };
  });
}

export async function createKnowledgeDraft(input: KnowledgeDraftInput): Promise<KnowledgeDocumentSummary> {
  ensureConfigured();
  const safe = validateDraft(input);
  const client = getCatalogServerClient();
  const { data: document, error: documentError } = await client
    .from("rag_documents")
    .insert({
      title: safe.title,
      kind: safe.kind,
      tags: safe.tags,
      catalog_product_id: safe.catalogProductId,
      catalog_category: safe.catalogCategory,
    })
    .select("id")
    .single();
  if (documentError || !document) throw serviceError(documentError, "No se pudo crear el borrador.");

  const { error: versionError } = await client
    .from("rag_document_versions")
    .insert({ document_id: document.id, revision: 1, content: safe.content, status: "draft" });
  if (versionError) throw serviceError(versionError, "No se pudo guardar el borrador.");

  const created = (await listKnowledgeDocuments()).find((item) => item.id === document.id);
  if (!created) throw new KnowledgeServiceError("El borrador fue creado, pero no se pudo volver a leer.");
  return created;
}

export async function saveKnowledgeDraft(documentId: string, input: KnowledgeDraftInput): Promise<KnowledgeDocumentSummary> {
  ensureConfigured();
  const safe = validateDraft(input);
  const client = getCatalogServerClient();
  const { error: documentError } = await client
    .from("rag_documents")
    .update({
      title: safe.title,
      kind: safe.kind,
      tags: safe.tags,
      catalog_product_id: safe.catalogProductId,
      catalog_category: safe.catalogCategory,
    })
    .eq("id", documentId);
  if (documentError) throw serviceError(documentError, "No se pudo actualizar el documento.");

  const { data: draft, error: draftError } = await client
    .from("rag_document_versions")
    .select("id")
    .eq("document_id", documentId)
    .eq("status", "draft")
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (draftError) throw serviceError(draftError, "No se pudo preparar el borrador.");

  if (draft?.id) {
    const { error } = await client.from("rag_document_versions").update({ content: safe.content }).eq("id", draft.id);
    if (error) throw serviceError(error, "No se pudo guardar el borrador.");
  } else {
    const { data: lastVersion, error: lastVersionError } = await client
      .from("rag_document_versions")
      .select("revision")
      .eq("document_id", documentId)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastVersionError) throw serviceError(lastVersionError, "No se pudo preparar una nueva versión.");
    const { error } = await client.from("rag_document_versions").insert({
      document_id: documentId,
      revision: (Number(lastVersion?.revision) || 0) + 1,
      content: safe.content,
      status: "draft",
    });
    if (error) throw serviceError(error, "No se pudo crear la nueva versión de borrador.");
  }

  const saved = (await listKnowledgeDocuments()).find((item) => item.id === documentId);
  if (!saved) throw new KnowledgeServiceError("No se encontró el documento guardado.");
  return saved;
}

export async function publishKnowledgeDraft(documentId: string): Promise<KnowledgeDocumentSummary> {
  ensureConfigured();
  const documents = await listKnowledgeDocuments();
  const document = documents.find((item) => item.id === documentId);
  const draft = document?.currentVersion?.status === "draft" ? document.currentVersion : null;
  if (!document || !draft) throw new KnowledgeServiceError("Guarda un borrador antes de publicarlo.");

  const chunks = chunkKnowledgeContent(document.title, draft.content);
  const { error } = await getCatalogServerClient().rpc("publish_terra_rag_version", {
    p_version_id: draft.id,
    p_chunks: chunks,
  });
  if (error) throw serviceError(error, "No se pudo publicar el conocimiento.");

  const published = (await listKnowledgeDocuments()).find((item) => item.id === documentId);
  if (!published) throw new KnowledgeServiceError("El documento fue publicado, pero no se pudo volver a leer.");
  return published;
}
