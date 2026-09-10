export const KNOWLEDGE_KINDS = ["company", "delivery", "policy", "faq", "product_supplement", "category"] as const;

export type KnowledgeKind = typeof KNOWLEDGE_KINDS[number];
export type KnowledgeVersionStatus = "draft" | "published" | "archived";

export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  kind: KnowledgeKind;
  tags: string[];
  catalogProductId: string | null;
  catalogCategory: string | null;
  updatedAt: string;
  currentVersion: {
    id: string;
    revision: number;
    status: KnowledgeVersionStatus;
    content: string;
    updatedAt: string;
    publishedAt: string | null;
  } | null;
}

export interface KnowledgeDraftInput {
  title: string;
  kind: KnowledgeKind;
  tags: string[];
  catalogProductId: string | null;
  catalogCategory: string | null;
  content: string;
}

export interface KnowledgeChunkInput {
  title: string;
  content: string;
  metadata: Record<string, string | number | boolean | null>;
}
