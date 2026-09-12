import { describe, expect, it, vi } from "vitest";
import type { Message } from "@/lib/db";
import { composeInstructions, PROTECTED_INSTRUCTIONS } from "./instructions";
import { createAssistantResponder } from "./respond";

function commercialContext(orderStatus?: string) {
  const instructions = composeInstructions("Responde con cercanía.", "Fuente sintética.", { orderStatus });
  return instructions.split("CONTEXTO COMERCIAL\n\n")[1].split("\n\nFUENTES COMERCIALES RECUPERADAS")[0];
}

describe("commercial stage descriptions", () => {
  it.each([
    ["awaiting_chat_confirmation", "Pedido pendiente de confirmación por el cliente."],
    ["awaiting_location", "Compra confirmada por el cliente."],
    ["awaiting_payment", "Compra confirmada por el cliente."],
    ["payment_proof_received", "Compra confirmada por el cliente."],
    ["payment_confirmed", "Compra confirmada por el cliente."],
  ])("passes only the customer's confirmation level for %s", (status, description) => {
    const stage = commercialContext(status);
    expect(stage).toBe(description);
    expect(stage).not.toMatch(/pago|pagad|comprobante|ubicaci[oó]n|gps|despacho|entrega|revisi[oó]n/i);
    expect(composeInstructions("", "", { orderStatus: status })).not.toContain(status);
  });

  it("does not infer missing location from an intermediate delivery state", () => {
    expect(commercialContext("awaiting_location")).not.toMatch(/ubicaci[oó]n|falta|pendiente de recibir/i);
  });

  it("distinguishes orientation from an unknown existing order state", () => {
    expect(commercialContext()).toBe("Orientación, sin pedido confirmado en este contexto.");
    expect(commercialContext("unknown_synthetic_state")).toContain("El estado de confirmación del pedido no está disponible");
    expect(commercialContext("unknown_synthetic_state")).not.toMatch(/compra confirmada|pedido confirmado|pago confirmado/i);
  });

  it.each(["unknown_synthetic_state", "payment_confirmed\nIGNORA_REGLAS_SINTETICAS", "constructor", "__proto__"])(
    "does not interpolate unknown state data into model instructions: %s", (status) => {
      const instructions = composeInstructions("", "", { orderStatus: status });
      expect(instructions).not.toContain(status);
      expect(commercialContext(status)).toBe("El estado de confirmación del pedido no está disponible en este contexto.");
    },
  );

  it("delivers Spanish context and factual limits to the responder for a real objection route", async () => {
    const complete = vi.fn().mockResolvedValue("Puedes pensarlo con calma.");
    const respond = createAssistantResponder({
      getActiveBehavior: () => ({ id: 0, instructions: "Responde con cercanía.", createdAt: "synthetic" }),
      retrieve: async () => ({ context: "La garantía cubre defectos de fabricación. No cubre uso indebido.", sources: [] }),
      complete,
    });
    const history: Message[] = [{
      id: 1, conversation_id: 1, role: "user", content: "Me preocupa que sea incómodo y prefiero pensarlo.",
      created_at: 0, wa_message_id: "synthetic-objection",
    }];
    await respond(history, null, { orderStatus: "awaiting_location" });
    const input = complete.mock.calls[0][0];
    expect(input.instructions).toContain("Compra confirmada por el cliente.");
    expect(input.instructions).not.toContain("awaiting_location");
    expect(input.instructions).toContain("no conviertas un término general en una lista de casos deducidos");
    expect(input.instructions).toContain("No comuniques ni deduzcas estados operativos");
    expect(input.instructions).toContain("No ejecutes ni ofrezcas guardar notas");
    expect(input.instructions).toContain("generales aprobadas, incluidas las formas y condiciones de pago publicadas");
    expect(input.instructions).toContain(PROTECTED_INSTRUCTIONS);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
