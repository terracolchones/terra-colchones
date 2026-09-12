import { describe, expect, it } from "vitest";
import { buildAssistantModelRequest, getAssistantModelSettings, readCompletedAssistantText } from "./assistant-model";

describe("assistant model request contract", () => {
  it.each([
    [{}, "gpt-5-mini"],
    [{ baseURL: "https://openrouter.ai/api/v1" }, "openai/gpt-5-mini"],
    [{ model: "gpt-5-mini", baseURL: "https://openrouter.ai/api/v1/" }, "openai/gpt-5-mini"],
    [{ model: "openai/gpt-5-mini", baseURL: "https://openrouter.ai/api/v1" }, "openai/gpt-5-mini"],
    [{ model: "openai/gpt-5-mini", baseURL: "https://api.openai.com/v1" }, "gpt-5-mini"],
    [{ model: "gpt-5-mini-2025-08-07", baseURL: "https://openrouter.ai/api/v1" }, "openai/gpt-5-mini-2025-08-07"],
  ])("selects the requested mini model using its provider's identifier: %j", (environment, model) => {
    expect(getAssistantModelSettings(environment)).toEqual({
      model, max_output_tokens: 1536, reasoning: { effort: "minimal" }, text: { verbosity: "low" }, store: false,
    });
  });

  it("retains an explicit model during a controlled configuration rollout without fallback", () => {
    expect(getAssistantModelSettings({ model: "google/gemini-2.5-flash-lite", baseURL: "https://openrouter.ai/api/v1" }))
      .toEqual({ model: "google/gemini-2.5-flash-lite", max_output_tokens: 220, reasoning: { effort: "none" }, store: false });
  });

  it("does not identify an unrelated provider as OpenRouter by a name substring", () => {
    expect(getAssistantModelSettings({ baseURL: "https://openrouter.ai.example.invalid/api/v1" }).model).toBe("gpt-5-mini");
  });

  it("includes only conversation roles and content, without identifiers or unsupported sampling knobs", () => {
    const history = [
      { role: "user", content: "Busco un producto ficticio.", id: 7, conversation_id: 2, created_at: 0, wa_message_id: "synthetic-id" },
      { role: "human", content: "Puedo orientarte.", id: 8, conversation_id: 2, created_at: 1, wa_message_id: "synthetic-answer" },
    ];
    const request = buildAssistantModelRequest({ instructions: "Usa solo fuentes aprobadas.", history });
    expect(request.input).toEqual([
      { role: "user", content: "Busco un producto ficticio." },
      { role: "assistant", content: "Puedo orientarte." },
    ]);
    for (const name of ["temperature", "top_p", "logprobs", "tools", "previous_response_id", "conversation", "metadata"]) {
      expect(request).not.toHaveProperty(name);
    }
    expect(request.store).toBe(false);
  });
});

describe("completed assistant output", () => {
  it("accepts completed SDK text", () => {
    expect(readCompletedAssistantText({ status: "completed", output_text: "Claro, te ayudo." })).toBe("Claro, te ayudo.");
  });

  it("accepts the WhatsApp text limit without silently trimming a response", () => {
    const text = "a".repeat(4096);
    expect(readCompletedAssistantText({ status: "completed", output_text: text })).toBe(text);
  });

  it("rejects completed output above the WhatsApp text limit before it reaches the handler", () => {
    expect(() => readCompletedAssistantText({ status: "completed", output_text: "a".repeat(4097) }))
      .toThrow("La IA devolvió una respuesta incompleta o no utilizable.");
  });

  it("extracts only visible text from raw Responses output, never reasoning summaries", () => {
    expect(readCompletedAssistantText({ status: "completed", output: [
      { type: "reasoning", summary: [{ type: "summary_text", text: "Internal synthetic reasoning" }] },
      { type: "message", status: "completed", content: [{ type: "output_text", text: "Claro. " }] },
      { type: "message", status: "completed", content: [{ type: "output_text", text: "Te ayudo." }] },
    ] })).toBe("Claro. Te ayudo.");
  });

  it.each([
    { status: "incomplete", output_text: "La dirección está en" },
    { status: "failed", output_text: "partial response", error: { message: "SYNTHETIC_PRIVATE_DIAGNOSTIC" } },
    { status: "in_progress", output_text: "Respuesta parcial" },
    { status: "completed", output_text: " " },
    { status: "completed", output_text: "Respuesta parcial", incomplete_details: { reason: "max_output_tokens" } },
    { status: "completed", output_text: "Respuesta parcial", output: [{ type: "message", status: "incomplete" }] },
    { status: "completed", output: [{ type: "reasoning", content: "Only private reasoning" }] },
    { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] },
    { output_text: "Missing response status" },
    null,
  ])("rejects unusable output without including provider content in errors: %j", (response) => {
    expect(() => readCompletedAssistantText(response)).toThrow("La IA devolvió una respuesta incompleta o no utilizable.");
  });
});
