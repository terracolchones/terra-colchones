import { describe, expect, it } from "vitest";
import { GREETING_RESUME_SECONDS, withConversationGreeting } from "./greeting";
import { ADVISOR_NOTICE } from "./instructions";

const body = "📍 Sucursal Ejemplo\nhttps://maps.example.invalid/central\nDirección: avenida de prueba.";
const user = (created_at?: number) => ({ role: "user", content: "Dame su dirección", created_at });
const assistant = (created_at?: number) => ({ role: "assistant", content: body, created_at });

describe("greetings at the start or resumption of a conversation", () => {
  it("greets the first reply and preserves the complete branch link", () => {
    expect(withConversationGreeting(body, [user(100)])).toBe(
      "¡Hola! 👋 Bienvenido a Terra. Soy el asistente virtual.\n\n" + body + "\n\n" + ADVISOR_NOTICE,
    );
  });
  it("does not repeat greetings during ongoing exchanges", () => {
    expect(withConversationGreeting(body, [user(100), assistant(101), user(120)])).toBe(body);
  });
  it.each(["Hola 😊", "¡Hola! 👋", "Hola de nuevo", "Buenos días"])(
    "removes an unnecessary model greeting in a continuing conversation: %s", (greeting) => {
      const continued = withConversationGreeting(greeting + "\n\n" + body, [user(100), assistant(101), user(120)]);
      expect(continued).toBe(body);
      expect(continued).toContain("https://maps.example.invalid/central");
    },
  );
  it("does not turn a greeting-only model response into an empty message", () => {
    expect(withConversationGreeting("Hola 😊", [user(100), assistant(101), user(120)])).toBe("Hola 😊");
  });
  it("preserves a bare map link after removing the repeated greeting", () => {
    expect(withConversationGreeting("Hola 😊 https://maps.example.invalid/central", [user(100), assistant(101), user(120)]))
      .toBe("https://maps.example.invalid/central");
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
        "¡Hola! 👋 Bienvenido a Terra. Soy el asistente virtual.\n\n" + body + "\n\n" + ADVISOR_NOTICE,
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
  it.each([
    'Si prefieres hablar con un asesor, escribe "asesor".',
    'Si quieres ayuda del equipo, escribe la palabra «asesor».',
    'Puedes escribir “asesor” para que te ayude el equipo.',
    'Escríbeme asesor si necesitas ayuda del equipo.',
  ])("keeps a single equivalent advisor invitation: %s", (notice) => {
    const reply = withConversationGreeting(body + "\n\n" + notice, [user(100)]);
    expect(reply).toBe("¡Hola! 👋 Bienvenido a Terra. Soy el asistente virtual.\n\n" + body + "\n\n" + notice);
    expect(reply).not.toContain(ADVISOR_NOTICE);
  });
  it("still supplies explicit advisor access when the reply only mentions an advisor", () => {
    const reply = withConversationGreeting("Un asesor puede revisar ese dato.", [user(100)]);
    expect(reply).toContain(ADVISOR_NOTICE);
  });
  it("keeps a complete model introduction from duplicating the Terra welcome", () => {
    const reply = withConversationGreeting("¡Hola! 👋 Bienvenido a Terra. Soy el asistente virtual. ¿Qué medida buscas?", [user(100)]);
    expect(reply).toBe("¡Hola! 👋 Bienvenido a Terra.\n\nSoy el asistente virtual. ¿Qué medida buscas?\n\n" + ADVISOR_NOTICE);
    expect(reply.match(/Bienvenido a Terra/g)).toHaveLength(1);
  });
  it("keeps a completed handoff free from instructions to request it again", () => {
    const reply = withConversationGreeting("Perfecto, te conecto con un asesor.", [user(100)], { includeAdvisorNotice: false });
    expect(reply).toBe("¡Hola! 👋 Bienvenido a Terra. Soy el asistente virtual.\n\nPerfecto, te conecto con un asesor.");
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
