import { describe, expect, it } from "vitest";
import { GREETING_RESUME_SECONDS, withConversationGreeting } from "./greeting";
import { ADVISOR_NOTICE } from "./instructions";

const body = "📍 Sucursal Ejemplo\nhttps://maps.example.invalid/central\nDirección: avenida de prueba.";
const user = (created_at?: number) => ({ role: "user", content: "Dame su dirección", created_at });
const assistant = (created_at?: number) => ({ role: "assistant", content: body, created_at });

describe("greetings at the start or resumption of a conversation", () => {
  it("greets the first reply and preserves the complete branch link", () => {
    expect(withConversationGreeting(body, [user(100)])).toBe(
      "¡Hola! 👋 Bienvenido a Terra. Soy el asistente virtual de la tienda.\n\n" + body + "\n\n" + ADVISOR_NOTICE,
    );
  });
  it("does not repeat greetings during ongoing exchanges", () => {
    expect(withConversationGreeting(body, [user(100), assistant(101), user(120)])).toBe(body);
  });
  it("greets after thirty minutes of inactivity, without timers or proactive messages", () => {
    expect(withConversationGreeting(body, [assistant(100), user(100 + GREETING_RESUME_SECONDS)])).toBe("¡Hola! 👋\n\n" + body);
  });
  it("does not infer resumption from absent, invalid or reversed timestamps", () => {
    for (const timestamp of [undefined, Number.NaN, Number.POSITIVE_INFINITY, 90]) {
      expect(withConversationGreeting(body, [assistant(100), user(timestamp)])).toBe(body);
    }
  });
  it("does not greet a second outbound response to the same incoming message", () => {
    expect(withConversationGreeting(body, [user(100), assistant(101)])).toBe(body);
  });
  it("introduces Terra once even when the model supplied a generic greeting", () => {
    for (const greeting of ["¡Hola! 👋", "Hola de nuevo 😊", "👋 Hola", "Buenos días"]) {
      expect(withConversationGreeting(greeting + "\n" + body, [user(100)])).toBe(
        "¡Hola! 👋 Bienvenido a Terra. Soy el asistente virtual de la tienda.\n\n" + body + "\n\n" + ADVISOR_NOTICE,
      );
    }
  });
  it("retains a returning greeting without repeating the presentation or advisor notice", () => {
    const greeting = "Hola de nuevo 😊 " + body;
    expect(withConversationGreeting(greeting, [assistant(100), user(1900)])).toBe(greeting);
  });
  it("does not repeat the virtual identity or the advisor notice already in the reply", () => {
    const identityReply = "Soy el asistente virtual de Terra y puedo ayudarte con tus consultas. " + ADVISOR_NOTICE;
    expect(withConversationGreeting(identityReply, [user(100)])).toBe("¡Hola! 👋 Bienvenido a Terra.\n\n" + identityReply);
  });
  it("keeps a complete model introduction from duplicating the Terra welcome", () => {
    const reply = withConversationGreeting("¡Hola! 👋 Bienvenido a Terra. Soy el asistente virtual de la tienda. ¿Qué medida buscas?", [user(100)]);
    expect(reply).toBe("¡Hola! 👋 Bienvenido a Terra.\n\nSoy el asistente virtual de la tienda. ¿Qué medida buscas?\n\n" + ADVISOR_NOTICE);
    expect(reply.match(/Bienvenido a Terra/g)).toHaveLength(1);
  });
  it("keeps a completed handoff free from instructions to request it again", () => {
    const reply = withConversationGreeting("Perfecto, te conecto con un asesor.", [user(100)], { includeAdvisorNotice: false });
    expect(reply).toBe("¡Hola! 👋 Bienvenido a Terra. Soy el asistente virtual de la tienda.\n\nPerfecto, te conecto con un asesor.");
    expect(reply).not.toContain('escribe "asesor"');
  });
  it("keeps the customer's question answered instead of replacing it with an open-ended welcome", () => {
    const reply = withConversationGreeting("👋 Hola. La sucursal está aquí:\nhttps://maps.example.invalid/central", [user(100)]);
    expect(reply).toContain("La sucursal está aquí:\nhttps://maps.example.invalid/central");
    expect(reply.match(/Hola/g)).toHaveLength(1);
    expect(reply).not.toContain("¿En qué");
  });
  it("leaves a full-sized response intact instead of truncating its map", () => {
    const full = "x".repeat(4096 - body.length) + body;
    expect(withConversationGreeting(full, [user(100)])).toBe(full);
  });
});
