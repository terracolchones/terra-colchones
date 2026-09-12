import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), semantic: vi.fn(), catalog: vi.fn(), catalogIds: vi.fn(), readFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@/lib/catalog-storefront/server", () => ({
  isCatalogConfigured: () => true,
  getCatalogServerClient: () => ({ rpc: mocks.rpc, functions: { invoke: mocks.semantic } }),
  getPublishedCatalogProductsForRag: mocks.catalog,
  getPublishedCatalogProductsForRagIds: mocks.catalogIds,
}));
vi.mock("@/lib/catalog-storefront/whatsapp", () => ({ parseCatalogLeadContext: () => null }));

const history = [{ id: 1, conversation_id: 1, role: "user" as const, content: "¿Cuál es el horario de atención?", wa_message_id: null, created_at: 0 }];
const indexedResponse = { data: [{ id: "synthetic-hours", title: "Horarios aprobados", source_kind: "knowledge", catalog_product_id: null,
  content: "El horario de atención de Terra es de lunes a viernes de 9 a 18.", score: 1 }], error: null };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
  vi.stubEnv("RAG_SEMANTIC_SEARCH_ENABLED", "false");
  mocks.catalog.mockResolvedValue([]);
  mocks.catalogIds.mockResolvedValue([]);
  mocks.readFile.mockResolvedValue("# Terra\n\n## Horarios\nEl horario de atención debe consultarse al equipo.");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("recoverable knowledge index", () => {
  it("never retrieves the contents of a local Markdown draft", async () => {
    mocks.readFile.mockResolvedValue('---\r\nestado: "borrador"\r\n---\r\n# Terra\r\n\r\n## Garantía\r\nLa garantía cubre DRAFT_ONLY_SENTINEL durante 17 meses.');
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { buildRagContext } = await import("./service");
    const result = await buildRagContext([{ ...history[0], content: "¿Qué garantía tiene?" }]);
    expect(JSON.stringify(result)).not.toContain("DRAFT_ONLY_SENTINEL");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("DRAFT_ONLY_SENTINEL");
    expect(warn).toHaveBeenCalledWith("[rag] La base local está en borrador; se utiliza únicamente el respaldo seguro.");
  });

  it("retains retrieval from published local Markdown", async () => {
    mocks.readFile.mockResolvedValue('---\nestado: publicado\n---\n# Terra\n\n## Garantía\nLa garantía cubre PUBLISHED_SYNTHETIC_FACT durante 17 meses.');
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const { buildRagContext } = await import("./service");
    const result = await buildRagContext([{ ...history[0], content: "¿Qué garantía tiene?" }]);
    expect(result.sources.some((source) => source.content.includes("PUBLISHED_SYNTHETIC_FACT"))).toBe(true);
  });

  it("retries after 30 seconds when an index is missing instead of disabling it until restart", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Could not find the function; synthetic-private-detail" } }).mockResolvedValue(indexedResponse);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { buildRagContext } = await import("./service");
    await buildRagContext(history);
    await buildRagContext(history);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    const recovered = await buildRagContext(history);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(recovered.sources.some((source) => source.id === "knowledge-synthetic-hours")).toBe(true);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("synthetic-private-detail");
  });

  it("recovers from a thrown index failure without logging provider details", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("synthetic-private-query")).mockResolvedValue(indexedResponse);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { buildRagContext } = await import("./service");
    await expect(buildRagContext(history)).resolves.toHaveProperty("sources");
    vi.advanceTimersByTime(30_000);
    expect((await buildRagContext(history)).sources).toHaveLength(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("synthetic-private-query");
  });

  it("falls back to the text index when semantic retrieval throws", async () => {
    vi.stubEnv("RAG_SEMANTIC_SEARCH_ENABLED", "true");
    mocks.semantic.mockRejectedValue(new Error("synthetic-private-query"));
    mocks.rpc.mockResolvedValue(indexedResponse);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { buildRagContext } = await import("./service");
    expect((await buildRagContext(history)).sources[0].id).toBe("knowledge-synthetic-hours");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
