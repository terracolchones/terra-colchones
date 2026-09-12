import { describe, expect, it } from "vitest";
import { GREETING_RESUME_SECONDS, withConversationGreeting } from "./greeting";

const body = "📍 Sucursal Ejemplo\nhttps://maps.example.invalid/central\nDirección: avenida de prueba.";
const user = (created_at?: number) => ({ role: "user", content: "Dame su dirección", created_at });
const assistant = (created_at?: number) => ({ role: "assistant", content: body, created_at });

describe("greetings at the start or resumption of a conversation", () => {
  it("greets the first reply and preserves the complete branch link", () => {
    expect(withConversationGreeting(body, [user(100)])).toBe("¡Hola! 👋\n\n" + body);
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
  it("does not double a greeting already present in the response", () => {
    for (const greeting of ["¡Hola! 👋", "Hola de nuevo 😊", "👋 Hola", "Buenos días"]) {
      expect(withConversationGreeting(greeting + "\n" + body, [user(100)])).toBe(greeting + "\n" + body);
    }
  });
  it("leaves a full-sized response intact instead of truncating its map", () => {
    const full = "x".repeat(4096 - body.length) + body;
    expect(withConversationGreeting(full, [user(100)])).toBe(full);
  });
});
