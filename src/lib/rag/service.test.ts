import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), semantic: vi.fn(), catalog: vi.fn(), catalogIds: vi.fn(), readFile: vi.fn(), published: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@/lib/catalog-storefront/server", () => ({
  isCatalogConfigured: () => true,
  getCatalogServerClient: () => ({ rpc: mocks.rpc, functions: { invoke: mocks.semantic }, from: () => {
    const query = { select: () => query, eq: () => query, order: () => query, range: mocks.published };
    return query;
  } }),
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
  mocks.published.mockResolvedValue({ data: [], error: null });
  mocks.readFile.mockResolvedValue("# Terra\n\n## Horarios\nEl horario de atención debe consultarse al equipo.");
});

describe("published knowledge as a secondary source", () => {
  it("reads current complete contact versions without consulting the stale index or local file", async () => {
    mocks.published.mockResolvedValue({ data: [{ id: "synthetic-contacts-v2", status: "published", content: "Pedidos e información - Ciudad Prueba\n- Asesor Uno: 70000001" }], error: null });
    mocks.rpc.mockResolvedValue({ data: [{ ...indexedResponse.data[0], content: "Pedidos e información - Ciudad Prueba\n- Asesor Uno: 79999999" }], error: null });
    const { buildRagContext } = await import("./service");
    const result = await buildRagContext([{ ...history[0], content: "Dame los teléfonos de Ciudad Prueba" }]);
    expect(result.directoryReply).toContain("Asesor Uno: 70000001");
    expect(result.context).not.toContain("79999999");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
  it("does not fall back to the old index after a contact followup loses published evidence", async () => {
    mocks.published.mockResolvedValue({ data: null, error: { message: "synthetic failure" } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { buildRagContext } = await import("./service");
    const result = await buildRagContext([{ ...history[0], content: "Dame los teléfonos de Ciudad Prueba" }, { ...history[0], content: "¿Y el de Asesor Uno?" }]);
    expect(result.directoryReply).toContain("No tengo un contacto publicado");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps product retrieval for mixed questions and replaces stale contact evidence with selected current facts", async () => {
    mocks.published.mockResolvedValue({ data: [{ id: "synthetic-contacts-v2", status: "published", content: "Pedidos e información - Ciudad Prueba\n- Asesor Uno: 70000001" }], error: null });
    mocks.rpc.mockResolvedValue({ data: [{ ...indexedResponse.data[0], content: "Pedidos e información - Ciudad Prueba\n- Asesor Uno: 79999999" }], error: null });
    mocks.catalog.mockResolvedValue([{ id: "synthetic-product", name: "Colchón de prueba", category: "Colchones", published: true,
      availability: "available", priceFrom: 999, shortDescription: "", description: "", specifications: [], variants: [] }]);
    const { buildRagContext } = await import("./service");
    const result = await buildRagContext([{ ...history[0], content: "Dame el teléfono de Ciudad Prueba y cuánto cuesta el colchón" }]);
    expect(result.directoryReply).toBeUndefined();
    expect(result.contactEvidence).toContain("Asesor Uno: 70000001");
    expect(result.context).toContain("Bs 999");
    expect(result.context).not.toContain("79999999");
  });
  it("retains payment policy from a shared contact document for a mixed phone and payment question", async () => {
    const content = "Pedidos e información - Ciudad Prueba\n- Asesor Uno: 70000001\n\nFormas de pago\nSe aceptan pagos en efectivo o por QR.";
    mocks.published.mockResolvedValue({ data: [{ id: "synthetic-contacts-v2", status: "published", content }], error: null });
    mocks.rpc.mockResolvedValue({ data: [{ ...indexedResponse.data[0], content: content.replace("70000001", "79999999") }], error: null });
    const { buildRagContext } = await import("./service");
    const { requiresHumanHandoffForQuery } = await import("./policy");
    const query = "Dame el teléfono de Ciudad Prueba y formas de pago";
    const result = await buildRagContext([{ ...history[0], content: query }]);
    expect(result.contactEvidence).toContain("Asesor Uno: 70000001");
    expect(result.context).toContain("Se aceptan pagos en efectivo o por QR.");
    expect(result.context).not.toContain("79999999");
    expect(requiresHumanHandoffForQuery(query, result.sources)).toBe(false);
  });
  const publishedPolicy = { id: "synthetic-policy-v1", status: "published", rag_documents: { title: "Garantía aprobada" },
    content: "La garantía cubre defectos de fabricación durante 12 meses." };

  it.each(["empty", "failed"])("retrieves a relevant published policy when the index is %s", async (mode) => {
    mocks.rpc.mockResolvedValue({ data: mode === "empty" ? [] : null, error: mode === "failed" ? { message: "synthetic provider failure" } : null });
    mocks.published.mockResolvedValue({ data: [publishedPolicy], error: null });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { buildRagContext } = await import("./service");
    const result = await buildRagContext([{ ...history[0], content: "¿Qué cubre la garantía?" }]);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].id).toBe("published-synthetic-policy-v1-0");
    expect(result.context).toContain("12 meses");
  });

  it("retains relevant indexed hours after checking for an explicitly scoped city directory", async () => {
    mocks.rpc.mockResolvedValue(indexedResponse);
    const { buildRagContext } = await import("./service");
    const result = await buildRagContext(history);
    expect(mocks.published).toHaveBeenCalledOnce();
    expect(result.sources[0].id).toBe("knowledge-synthetic-hours");
  });

  it("does not inject unrelated documents or draft content", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.published.mockResolvedValue({ data: [
      { ...publishedPolicy, status: "draft", content: "La garantía cubre DRAFT_ONLY_SENTINEL durante 99 meses." },
      { ...publishedPolicy, id: "synthetic-unrelated", rag_documents: { title: "Decoración" }, content: "Decoración artesanal con MISMATCH_SENTINEL y acabados rústicos." },
    ], error: null });
    const { buildRagContext } = await import("./service");
    const result = await buildRagContext([{ ...history[0], content: "¿Qué cubre la garantía?" }]);
    expect(JSON.stringify(result)).not.toContain("DRAFT_ONLY_SENTINEL");
    expect(JSON.stringify(result)).not.toContain("MISMATCH_SENTINEL");
  });

  it("uses published payment evidence without forcing an advisor reply", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.published.mockResolvedValue({ data: [{ ...publishedPolicy, rag_documents: { title: "Formas de pago" },
      content: "Las formas de pago permiten pagar mediante transferencia o al recibir." }], error: null });
    const { buildRagContext } = await import("./service");
    const { createAssistantResponder } = await import("../behavior/respond");
    const complete = vi.fn().mockResolvedValue("Puedes pagar al recibir, según la política publicada.");
    const respond = createAssistantResponder({ getActiveBehavior: () => ({ id: 0, instructions: "Asistente de prueba", createdAt: "" }), retrieve: buildRagContext, complete });
    const result = await respond([{ ...history[0], content: "¿Se puede pagar al recibir?" }]);
    expect(complete).toHaveBeenCalledOnce();
    expect(result.needsAdvisorConfirmation).toBe(false);
    expect(result.content).toContain("al recibir");
  });

  it("searches the published catalog when a healthy index has no product hits", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.catalog.mockResolvedValue([{ id: "synthetic-product", name: "Colchón de prueba", category: "Colchones", published: true,
      availability: "available", priceFrom: 999, shortDescription: "", description: "", specifications: [], variants: [] }]);
    const { buildRagContext } = await import("./service");
    const result = await buildRagContext([{ ...history[0], content: "¿Cuánto cuesta el colchón?" }]);
    expect(result.sources.some((source) => source.kind === "catalog" && source.content.includes("Bs 999"))).toBe(true);
  });
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

  it("keeps a valid semantic paraphrase without requiring lexical overlap", async () => {
    vi.stubEnv("RAG_SEMANTIC_SEARCH_ENABLED", "true");
    mocks.semantic.mockResolvedValue({ data: { results: [{ id: "synthetic-evening-hours", title: "Horarios",
      source_kind: "knowledge", catalog_product_id: null, content: "El local permanece abierto hasta las 21:00.", score: 1 }] }, error: null });
    const { buildRagContext } = await import("./service");
    const result = await buildRagContext([{ ...history[0], content: "¿Atienden después de que anochece?" }]);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].id).toBe("knowledge-synthetic-evening-hours");
    expect(result.context).toContain("21:00");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.published).not.toHaveBeenCalled();
  });

  it("backs off a failed semantic service independently of successful FTS and retries after 30 seconds", async () => {
    vi.stubEnv("RAG_SEMANTIC_SEARCH_ENABLED", "true");
    mocks.semantic.mockResolvedValueOnce({ data: null, error: { status: 401, message: "PRIVATE_SEMANTIC_SENTINEL" } })
      .mockResolvedValue({ data: { results: indexedResponse.data }, error: null });
    mocks.rpc.mockResolvedValue(indexedResponse);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { buildRagContext } = await import("./service");
    await buildRagContext(history);
    await buildRagContext(history);
    vi.advanceTimersByTime(29_999);
    await buildRagContext(history);
    expect(mocks.semantic).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(1);
    const recovered = await buildRagContext(history);
    expect(mocks.semantic).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(recovered.sources[0].id).toBe("knowledge-synthetic-hours");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("PRIVATE_SEMANTIC_SENTINEL");
  });
});
