import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invalidate: vi.fn(), published: false }));
vi.mock("@/lib/rag/published-knowledge", () => ({ invalidatePublishedKnowledgeCache: mocks.invalidate }));
vi.mock("@/lib/catalog-storefront/server", () => ({
  isCatalogConfigured: () => true,
  getCatalogServerClient: () => ({ rpc: mocks.rpc, from: (table: string) => {
    const query = { select: () => query, in: () => query, order: async () => ({ error: null, data: table === "rag_documents"
      ? [{ id: "synthetic-document", title: "Garantía", kind: "policy", tags: [] }]
      : [{ id: "synthetic-version", document_id: "synthetic-document", revision: 1, status: mocks.published ? "published" : "draft", content: "La garantía ficticia cubre defectos de fabricación." }] }) };
    return query;
  } }),
}));

beforeEach(() => {
  vi.clearAllMocks(); mocks.published = false;
  mocks.rpc.mockImplementation(async () => { mocks.published = true; return { error: null }; });
});

describe("publication refreshes the lexical knowledge cache", () => {
  it("invalidates after successful publication before returning the saved document", async () => {
    const { publishKnowledgeDraft } = await import("./knowledge");
    const result = await publishKnowledgeDraft("synthetic-document");
    expect(mocks.rpc).toHaveBeenCalledWith("publish_terra_rag_version", expect.objectContaining({ p_version_id: "synthetic-version" }));
    expect(mocks.invalidate).toHaveBeenCalledOnce();
    expect(result.currentVersion?.status).toBe("published");
  });

  it("does not invalidate or claim success when publication fails", async () => {
    mocks.rpc.mockResolvedValue({ error: new Error("Synthetic publication failure") });
    const { publishKnowledgeDraft } = await import("./knowledge");
    await expect(publishKnowledgeDraft("synthetic-document")).rejects.toThrow("No se pudo publicar");
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
