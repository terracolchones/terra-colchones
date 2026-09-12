import { describe, expect, it, vi } from "vitest";
import type { Message } from "@/lib/db";
import { createAssistantResponder } from "./respond";
import { PROTECTED_INSTRUCTIONS } from "./instructions";
import { sanitizeHistory } from "./privacy";

const message = (content: string, role: Message["role"] = "user"): Message => ({
  id: 1, conversation_id: 1, role, content, wa_message_id: "synthetic", created_at: 0,
});
function setup() {
  let active = { id: 1, instructions: "Responde con cercanía.", createdAt: "synthetic" };
  const complete = vi.fn().mockResolvedValue("Respuesta sintética.");
  const retrieve = vi.fn().mockResolvedValue({ context: "Horario sintético: 9 a 12.", sources: [{
    id: "synthetic", label: "Horario", kind: "knowledge", content: "Horario sintético: 9 a 12.", score: 1,
  }] });
  const onRetrievalFailure = vi.fn();
  const respond = createAssistantResponder({ getActiveBehavior: () => active, retrieve, complete, onRetrievalFailure });
  return { respond, retrieve, complete, onRetrievalFailure, publish: () => { active = { ...active, id: 2, instructions: "Responde formalmente." }; } };
}

describe("runtime consumes published behavior and approved context", () => {
  it("reads active instructions again on the next turn and includes protected rules", async () => {
    const f = setup();
    await f.respond([message("¿Cuáles son los horarios?")]);
    f.publish();
    await f.respond([message("¿Cuáles son los horarios?")]);
    expect(f.complete.mock.calls[0][0].instructions).toContain("Responde con cercanía.");
    expect(f.complete.mock.calls[1][0].instructions).toContain("Responde formalmente.");
    expect(f.complete.mock.calls[1][0].instructions).not.toContain("Responde con cercanía.");
    expect(f.complete.mock.calls[1][0].instructions).toContain(PROTECTED_INSTRUCTIONS);
  });
  it("uses one prompt version during a lookup even if publication happens meanwhile", async () => {
    const f = setup();
    f.retrieve.mockImplementationOnce(async () => { f.publish(); return { context: "", sources: [] }; });
    await f.respond([message("Me parece caro")]);
    expect(f.complete.mock.calls[0][0].instructions).toContain("Responde con cercanía.");
  });
  it("passes selection and commercial stage without private order fields", async () => {
    const f = setup();
    const lead = { productId: "synthetic-product", variantId: "synthetic-variant" };
    await f.respond([message("¿Cuáles son los horarios?")], lead, {
      orderStatus: "awaiting_payment", productName: "Sillón de prueba", variantLabel: "Azul",
    });
    expect(f.retrieve.mock.calls[0][1]).toEqual(lead);
    expect(f.complete.mock.calls[0][0].instructions).toContain("awaiting_payment");
    expect(f.complete.mock.calls[0][0].instructions).toContain("Sillón de prueba · Azul");
    expect(f.complete.mock.calls[0][0].instructions).toContain("Horario sintético");
  });
  it("redacts synthetic private values before both retrieval and generation", async () => {
    const f = setup();
    const secretMarkers = ["12345678999", "demo@example.invalid", "T-TEST-DEMO", "https://example.invalid/?checkout=private"];
    await f.respond([message(secretMarkers.join("; ")), message("Me parece caro")]);
    const retrievalInput = JSON.stringify(f.retrieve.mock.calls[0][0]);
    const completionInput = JSON.stringify(f.complete.mock.calls[0][0].history);
    for (const secret of secretMarkers) {
      expect(retrievalInput).not.toContain(secret);
      expect(completionInput).not.toContain(secret);
    }
  });
  it("does not query the model to invent a price when retrieval fails", async () => {
    const f = setup();
    f.retrieve.mockRejectedValueOnce(new Error("synthetic-private-error"));
    const reply = await f.respond([message("¿Cuánto cuesta?")]);
    expect(reply.needsAdvisorConfirmation).toBe(true);
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.onRetrievalFailure).toHaveBeenCalledExactlyOnceWith();
  });
  it("fails closed when active configuration cannot be read", async () => {
    const complete = vi.fn();
    const respond = createAssistantResponder({ getActiveBehavior: () => { throw new Error("configuration unavailable"); }, retrieve: vi.fn(), complete });
    await expect(respond([message("Hola")])).rejects.toThrow("configuration unavailable");
    expect(complete).not.toHaveBeenCalled();
  });
  it("rejects empty responses and leaked reasoning", async () => {
    const f = setup();
    for (const output of [" ", "<think>internal</think>Hola"]) {
      f.complete.mockResolvedValueOnce(output);
      await expect(f.respond([message("Me parece caro")])).rejects.toThrow("no utilizable");
    }
  });
  it("bounds history and removes prior reasoning", () => {
    const result = sanitizeHistory([...Array.from({ length: 25 }, () => message("Texto")), message("thinking process: private", "assistant")]);
    expect(result).toHaveLength(19);
    expect(JSON.stringify(result)).not.toContain("thinking process");
  });
  it("minimizes volunteered residence descriptions while retaining a separate question", () => {
    const sanitized = sanitizeHistory([message("Vivo en pasaje ficticio azul; ¿Qué garantía tiene?")]);
    expect(sanitized[0].content).not.toContain("pasaje ficticio azul");
    expect(sanitized[0].content).toContain("garantía");
  });
});
