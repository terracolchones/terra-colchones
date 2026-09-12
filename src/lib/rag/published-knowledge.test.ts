import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() }));
vi.mock("@/lib/catalog-storefront/server", () => ({
  isCatalogConfigured: () => true,
  getCatalogServerClient: () => ({ from: mocks.from }),
}));

const version = (id: string, status = "published") => ({ id, status, rag_documents: { title: "Garantía" }, content: `La garantía cubre defectos de fabricación de ${id}.` });
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(0);
  const query = { select: mocks.select, eq: mocks.eq, order: mocks.order, range: mocks.range };
  mocks.from.mockReturnValue(query); mocks.select.mockReturnValue(query); mocks.eq.mockReturnValue(query); mocks.order.mockReturnValue(query);
  mocks.range.mockResolvedValue({ data: [version("synthetic-v1")], error: null });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("published knowledge cache", () => {
  it("fresh directory reads bypass cached old approvals and preserve a complete long phone field", async () => {
    const { getPublishedKnowledgeChunks } = await import("./published-knowledge");
    await getPublishedKnowledgeChunks();
    const longContent = "Pedidos e información - Ciudad Prueba\n" + "Detalle sintético. ".repeat(100) + "\n- Asesor Uno: 70000001";
    mocks.range.mockResolvedValue({ data: [{ ...version("synthetic-v2"), content: longContent }], error: null });
    const result = await getPublishedKnowledgeChunks({ fresh: true, wholeDocuments: true });
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(longContent);
    expect((await getPublishedKnowledgeChunks())[0].id).toContain("synthetic-v1");
  });
  it("does not retrieve or expose a mutable draft title in the model sources", async () => {
    mocks.range.mockResolvedValue({ data: [{ ...version("synthetic-published"),
      rag_documents: { title: "DRAFT_TITLE_SENTINEL promoción no publicada" },
    }], error: null });
    const { getPublishedKnowledgeChunks } = await import("./published-knowledge");
    const { retrieveApprovedSources, formatRetrievedSources } = await import("./core");
    const knowledge = await getPublishedKnowledgeChunks();
    const sources = retrieveApprovedSources({ query: "¿Qué cubre la garantía?", products: [], knowledge });
    expect(mocks.select).toHaveBeenCalledWith("id,status,content");
    expect(sources).toHaveLength(1);
    expect(sources[0].label).toBe("Documento publicado");
    expect(formatRetrievedSources(sources)).not.toContain("DRAFT_TITLE_SENTINEL");
    expect(formatRetrievedSources(sources)).toContain("defectos de fabricación");
  });

  it("only queries published versions and rejects drafts even in a malformed result", async () => {
    mocks.range.mockResolvedValue({ data: [version("synthetic-published"), version("synthetic-draft", "draft"), version("synthetic-archived", "archived")], error: null });
    const { getPublishedKnowledgeChunks } = await import("./published-knowledge");
    const chunks = await getPublishedKnowledgeChunks();
    expect(mocks.from).toHaveBeenCalledWith("rag_document_versions");
    expect(mocks.eq).toHaveBeenCalledWith("status", "published");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].id).toContain("synthetic-published");
  });

  it("refreshes published content after the bounded TTL", async () => {
    const { getPublishedKnowledgeChunks, PUBLISHED_KNOWLEDGE_CACHE_MS } = await import("./published-knowledge");
    await getPublishedKnowledgeChunks();
    mocks.range.mockResolvedValue({ data: [version("synthetic-v2")], error: null });
    expect((await getPublishedKnowledgeChunks())[0].id).toContain("synthetic-v1");
    vi.advanceTimersByTime(PUBLISHED_KNOWLEDGE_CACHE_MS);
    expect((await getPublishedKnowledgeChunks())[0].id).toContain("synthetic-v2");
    expect(mocks.range).toHaveBeenCalledTimes(2);
  });

  it("invalidates immediately after publication without waiting for the TTL", async () => {
    const { getPublishedKnowledgeChunks, invalidatePublishedKnowledgeCache } = await import("./published-knowledge");
    await getPublishedKnowledgeChunks();
    mocks.range.mockResolvedValue({ data: [version("synthetic-v2")], error: null });
    invalidatePublishedKnowledgeCache();
    expect((await getPublishedKnowledgeChunks())[0].id).toContain("synthetic-v2");
  });

  it("does not let an in-flight older read repopulate the cache after publication", async () => {
    let finishOld!: (value: { data: ReturnType<typeof version>[]; error: null }) => void;
    mocks.range.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    const { getPublishedKnowledgeChunks, invalidatePublishedKnowledgeCache } = await import("./published-knowledge");
    const oldRead = getPublishedKnowledgeChunks();
    invalidatePublishedKnowledgeCache();
    mocks.range.mockResolvedValue({ data: [version("synthetic-v2")], error: null });
    await getPublishedKnowledgeChunks();
    finishOld({ data: [version("synthetic-v1")], error: null });
    await oldRead;
    expect((await getPublishedKnowledgeChunks())[0].id).toContain("synthetic-v2");
  });

  it("does not reuse expired content after a failure or expose provider details", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getPublishedKnowledgeChunks, PUBLISHED_KNOWLEDGE_CACHE_MS } = await import("./published-knowledge");
    await getPublishedKnowledgeChunks();
    vi.advanceTimersByTime(PUBLISHED_KNOWLEDGE_CACHE_MS);
    mocks.range.mockResolvedValue({ data: null, error: { message: "PRIVATE_PROVIDER_SENTINEL" } });
    expect(await getPublishedKnowledgeChunks()).toEqual([]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("PRIVATE_PROVIDER_SENTINEL");
  });
});
