import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/lib/db";

const mocked = vi.hoisted(() => {
  const create = vi.fn();
  return { create, constructor: vi.fn(function () { return { responses: { create } }; }) };
});
vi.mock("openai", () => ({ default: mocked.constructor }));
vi.mock("@/lib/behavior/store", () => ({
  getActiveBehavior: () => ({ id: 0, instructions: "Responde con brevedad.", createdAt: new Date(0).toISOString() }),
}));
vi.mock("@/lib/rag/service", () => ({ buildRagContext: async () => ({ sources: [], context: "" }) }));

const history: Message[] = [{
  id: 1, conversation_id: 1, role: "user", content: "Hola", created_at: 0, wa_message_id: "synthetic-model-test",
}];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "synthetic-provider-key");
  vi.stubEnv("OPENAI_MODEL", "openai/gpt-5-mini");
  vi.stubEnv("OPENAI_BASE_URL", "https://openrouter.ai/api/v1");
  mocked.create.mockResolvedValue({ status: "completed", output_text: "Claro, te ayudo." });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("configured AI adapter", () => {
  it("uses the GPT-5 mini request contract through the configured provider with one attempt", async () => {
    const { generateAssistantReply } = await import("./openai");
    expect(await generateAssistantReply(history)).toEqual({ content: "Claro, te ayudo.", needsAdvisorConfirmation: false });
    expect(mocked.constructor).toHaveBeenCalledExactlyOnceWith({
      apiKey: "synthetic-provider-key", baseURL: "https://openrouter.ai/api/v1", maxRetries: 0,
    });
    expect(mocked.create).toHaveBeenCalledTimes(1);
    expect(mocked.create).toHaveBeenCalledWith(expect.objectContaining({
      model: "openai/gpt-5-mini", max_output_tokens: 1536,
      reasoning: { effort: "minimal" }, text: { verbosity: "low" }, store: false,
      input: [{ role: "user", content: "Hola" }],
    }));
  });

  it("does not return partial output as a customer reply", async () => {
    mocked.create.mockResolvedValue({ status: "incomplete", output_text: "La sucursal está en" });
    const { generateAssistantReply } = await import("./openai");
    await expect(generateAssistantReply(history)).rejects.toThrow("La IA devolvió una respuesta incompleta o no utilizable.");
    expect(mocked.create).toHaveBeenCalledTimes(1);
  });

  it("does not return a completed response that exceeds the WhatsApp text limit", async () => {
    mocked.create.mockResolvedValue({ status: "completed", output_text: "a".repeat(4097) });
    const { generateAssistantReply } = await import("./openai");
    await expect(generateAssistantReply(history)).rejects.toThrow("La IA devolvió una respuesta incompleta o no utilizable.");
    expect(mocked.create).toHaveBeenCalledTimes(1);
  });

  it("does not retry, change provider or expose remote diagnostics after rejection", async () => {
    mocked.create.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_PROVIDER_DIAGNOSTIC"));
    const { generateAssistantReply } = await import("./openai");
    await expect(generateAssistantReply(history)).rejects.toThrow("No se pudo completar la respuesta de IA; sin reintentos automáticos.");
    expect(mocked.create).toHaveBeenCalledTimes(1);
    expect(mocked.constructor).toHaveBeenCalledTimes(1);
  });

  it("defaults to the exact selected model without requiring a second credential", async () => {
    vi.stubEnv("OPENAI_MODEL", "");
    const { generateAssistantReply } = await import("./openai");
    await generateAssistantReply(history);
    expect(mocked.create).toHaveBeenCalledWith(expect.objectContaining({ model: "openai/gpt-5-mini" }));
    expect(mocked.constructor).toHaveBeenCalledTimes(1);
  });
});
