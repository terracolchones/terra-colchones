import { KNOWLEDGE_KINDS, type KnowledgeDraftInput } from "./knowledge-types";

const kinds = new Set<string>(KNOWLEDGE_KINDS);

/** Convierte únicamente el formulario del panel a un borrador validable. */
export function parseKnowledgeDraftInput(value: unknown): KnowledgeDraftInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.title !== "string" || typeof body.content !== "string" || typeof body.kind !== "string" || !kinds.has(body.kind)) return null;
  return {
    title: body.title,
    content: body.content,
    kind: body.kind as KnowledgeDraftInput["kind"],
    tags: Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === "string") : [],
    catalogProductId: typeof body.catalogProductId === "string" ? body.catalogProductId : null,
    catalogCategory: typeof body.catalogCategory === "string" ? body.catalogCategory : null,
  };
}
