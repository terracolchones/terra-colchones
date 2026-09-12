import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const guards = vi.hoisted(() => ({ databaseOpens: vi.fn() }));

// Type references must remain erased: importing a live provider fails this suite.
vi.mock("@/lib/db", () => { throw new Error("The simulator must not import operational persistence."); });
vi.mock("@/lib/openai", () => { throw new Error("The simulator must not import the live completion adapter."); });
vi.mock("@/lib/meta/client", () => { throw new Error("The simulator must not import the live Meta adapter."); });
vi.mock("@/lib/catalog-storefront/server", () => { throw new Error("The simulator must not import live catalog access."); });
vi.mock("@/lib/rag/service", () => { throw new Error("The simulator must not import live retrieval."); });
vi.mock("better-sqlite3", () => ({
  default: class ForbiddenDatabase {
    constructor() {
      guards.databaseOpens();
      throw new Error("Synthetic tests cannot open a database.");
    }
  },
}));

import { simulateBehavior, type SimulationInput, type SimulationResult } from "./simulator";
import { POST } from "@/app/api/behavior/test/route";

const prompt = "Instrucciones de prueba: responde con cercanía y atiende primero la pregunta.";
const baseInput: SimulationInput = { instructions: prompt, stage: "orientation", message: "¿Qué garantía tiene?" };
const authorization = `Basic ${Buffer.from("synthetic:local-fixture").toString("base64")}`;

function request(input: unknown = baseInput, headers: Record<string, string> = {}) {
  return new NextRequest("https://agent.invalid/api/behavior/test", {
    method: "POST",
    headers: { authorization, origin: "https://agent.invalid", "content-type": "application/json", ...headers },
    body: JSON.stringify(input),
  });
}

beforeEach(() => {
  guards.databaseOpens.mockClear();
  vi.stubEnv("DASHBOARD_BASIC_AUTH_USER", "synthetic");
  vi.stubEnv("DASHBOARD_BASIC_AUTH_PASSWORD", "local-fixture");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this test."));
});

afterEach(() => {
  expect(guards.databaseOpens).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("shared processor simulation with fictitious providers", () => {
  it("uses the real retrieval and composition path with clearly fictitious sources", async () => {
    const result = await simulateBehavior(baseInput);
    expect(result.modelCalled).toBe(true);
    expect(result.route).toBe("Generador simulado");
    expect(result.sources).toContainEqual({ kind: "knowledge", label: "Garantía ficticia" });
    expect(result.effectiveInstructions).toContain(prompt);
    expect(result.effectiveInstructions).toContain("REGLAS PROTEGIDAS DEL SERVICIO");
    expect(result.effectiveInstructions).toContain("garantía del colchón de prueba");
    expect(result.replies).toHaveLength(1);
    expect(result.replies[0]).toContain("Respuesta simulada");
    expect(result.notes.join(" ")).toContain("no evalúa el tono ni la calidad");
  });

  it("shows a draft change in the actual instructions captured by the simulated generator", async () => {
    const first = await simulateBehavior(baseInput);
    const second = await simulateBehavior({ ...baseInput, instructions: "Nueva instrucción ficticia: una sola pregunta por turno." });
    expect(first.effectiveInstructions).not.toEqual(second.effectiveInstructions);
    expect(second.effectiveInstructions).toContain("Nueva instrucción ficticia: una sola pregunta por turno.");
    expect(second.effectiveInstructions).not.toContain(prompt);
    expect(second.sources).toEqual(first.sources);
  });

  it("uses a selected synthetic product and a policy without forcing proof submission", async () => {
    const result = await simulateBehavior({ ...baseInput, stage: "awaiting_payment", message: "¿Qué formas de pago aceptan?" });
    expect(result.modelCalled).toBe(true);
    expect(result.sources).toContainEqual({ kind: "knowledge", label: "Métodos de pago ficticios" });
    expect(result.sources.some((source) => source.kind === "catalog")).toBe(true);
    expect(result.effectiveInstructions).toContain("awaiting_payment");
    expect(result.effectiveInstructions).toContain("Dos plazas de prueba");
    expect(result.replies.join(" ")).not.toMatch(/env[ií]a (?:la imagen de )?tu comprobante/i);
  });

  it("preserves the literal advisor path and does not pretend it used model instructions", async () => {
    const result = await simulateBehavior({ ...baseInput, message: "asesor" });
    expect(result.route).toBe("Atención humana");
    expect(result.modelCalled).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.replies).toEqual(["¡Hola! 👋 Bienvenido a Terra. Soy el asistente virtual de la tienda.\n\nPerfecto, te conecto con un asesor comercial para ayudarte a avanzar."]);
    expect(result.notes.join(" ")).toContain("El modelo no fue llamado");
  });

  it.each(["No quiero un asesor", "¿Eres humano?"])("does not transfer on a mention: %s", async (message) => {
    const result = await simulateBehavior({ ...baseInput, message });
    expect(result.route).not.toBe("Atención humana");
    expect(result.replies.join(" ")).not.toContain("te conecto con un asesor");
  });

  it("a thank-you during proof review remains a conversation response", async () => {
    const result = await simulateBehavior({ ...baseInput, stage: "payment_proof_received", message: "Gracias" });
    expect(result.modelCalled).toBe(false);
    expect(result.replies).toHaveLength(1);
    expect(result.replies.join(" ")).not.toMatch(/comprobante|pago|QR|ubicaci[oó]n|revisi[oó]n/i);
  });

  it("simulates website confirmation with advisor access and a dummy GPS action", async () => {
    const result = await simulateBehavior({ ...baseInput, message: "Hola Terra, confirmo mi pedido #T-DEMO-0001" });
    expect(result.route).toBe("Confirmación y solicitud GPS simulada");
    expect(result.modelCalled).toBe(false);
    expect(result.replies.join(" ")).toContain('Si quieres hablar con un asesor, escribe "asesor".');
    expect(result.replies.join(" ")).toContain("Solicitud GPS simulada");
  });

  it("an order code inside cancellation does not claim or confirm the order", async () => {
    const result = await simulateBehavior({ ...baseInput, stage: "awaiting_payment", message: "Quiero cancelar el pedido #T-DEMO-0001" });
    expect(result.route).not.toContain("GPS");
    expect(result.route).not.toBe("Atención humana");
    expect(result.replies.join(" ")).not.toMatch(/pedido.*confirmado|env[ií]a (?:la imagen de )?tu comprobante/i);
  });

  it("isolates every test turn so a simulated handoff cannot silence the next test", async () => {
    await simulateBehavior({ ...baseInput, message: "asesor" });
    const result = await simulateBehavior({ ...baseInput, message: "Hola" });
    expect(result.route).toBe("Catálogo");
    expect(result.replies.join(" ")).toContain("Botón Ver catálogo simulado");
  });
});

describe("authenticated behavior simulator endpoint", () => {
  it("rejects unavailable authentication, missing credentials and foreign origins before testing", async () => {
    expect((await POST(request(baseInput, { authorization: "" }))).status).toBe(401);
    expect((await POST(request(baseInput, { origin: "https://other.invalid" }))).status).toBe(403);
    expect((await POST(request(baseInput, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    vi.stubEnv("DASHBOARD_BASIC_AUTH_PASSWORD", "");
    expect((await POST(request())).status).toBe(503);
  });

  it.each([
    { label: "empty instructions", overrides: { instructions: "" } },
    { label: "long instructions", overrides: { instructions: "x".repeat(12_001) } },
    { label: "numeric instructions", overrides: { instructions: 123 } },
    { label: "blank message", overrides: { message: " " } },
    { label: "long message", overrides: { message: "x".repeat(4097) } },
    { label: "boolean message", overrides: { message: false } },
    { label: "unknown stage", overrides: { stage: "real-production" } },
    { label: "null stage", overrides: { stage: null } },
    { label: "extra field", overrides: { extra: "unexpected" } },
  ])("rejects invalid simulator input: $label", async ({ overrides }) => {
    const response = await POST(request({ ...baseInput, ...overrides }));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("bounds streamed bodies and rejects unsupported content types", async () => {
    expect((await POST(request({ ...baseInput, instructions: "x".repeat(66_000) }))).status).toBe(413);
    expect((await POST(request(baseInput, { "content-type": "text/plain" }))).status).toBe(415);
  });

  it("returns the shared simulated result without touching a database or network", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json() as SimulationResult;
    expect(result.modelCalled).toBe(true);
    expect(result.effectiveInstructions).toContain(prompt);
    expect(result.sources).toContainEqual({ kind: "knowledge", label: "Garantía ficticia" });
    expect(result.notes.join(" ")).toContain("No consulta cuentas");
  });
});
