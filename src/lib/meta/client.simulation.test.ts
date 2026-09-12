import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isExpiredMetaAccessToken, MetaGraphError, sendCatalogCtaMessage, sendTextMessage } from "./client";
import { messageRef } from "./diagnostics";

// Every fetch is replaced with an in-memory Response. unstubAllGlobals restores
// the offline runner's guard, not a live network implementation.
const fetchMock = vi.fn<typeof fetch>();
const output = vi.fn();
let restoreOutput: () => void;
const PRIVATE = "test-only-private-sentinel";

beforeEach(() => {
  fetchMock.mockReset();
  output.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("META_PHONE_NUMBER_ID", "test-only-channel");
  vi.stubEnv("META_ACCESS_TOKEN", "test-only-token");
  vi.stubEnv("META_GRAPH_VERSION", "v25.0");
  const spy = vi.spyOn(console, "info").mockImplementation(output);
  restoreOutput = () => spy.mockRestore();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  restoreOutput();
});

function events(): Array<Record<string, unknown>> {
  return output.mock.calls.map((call) => JSON.parse(String(call[1])));
}

describe("offline Graph acceptance diagnostics, without retries", () => {
  it("records acceptance, not delivery, and correlates the WAMID opaquely", async () => {
    const id = `synthetic-wamid-${PRIVATE}`;
    fetchMock.mockResolvedValueOnce(Response.json({ messages: [{ id }] }));
    await expect(sendTextMessage(`synthetic-recipient-${PRIVATE}`, `Synthetic text ${PRIVATE}`)).resolves.toEqual({ wa_message_id: id });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events().map((event) => event.event)).toEqual(["send.attempt", "send.accepted"]);
    expect(events()[1].message_ref).toBe(messageRef(id));
    expect(events()[0].attempt_ref).toBe(events()[1].attempt_ref);
    expect(events()[1]).toMatchObject({ kind: "text", http_status: 200 });
    expect(events()[1]).not.toHaveProperty("status");
    expect(JSON.stringify(output.mock.calls)).not.toContain(PRIVATE);
    expect(JSON.stringify(output.mock.calls)).not.toContain("test-only-token");
    expect(JSON.stringify(output.mock.calls)).not.toContain("test-only-channel");
  });

  it("records a structured 4xx rejection by numeric code, without provider text", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: 123, error_subcode: 456, message: PRIVATE } }, { status: 400 }));
    await expect(sendTextMessage("synthetic-recipient", "Synthetic text")).rejects.toMatchObject({ name: "MetaGraphError", status: 400, code: 123, subcode: 456 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events().map((event) => event.event)).toEqual(["send.attempt", "send.rejected"]);
    expect(events()[1]).toMatchObject({ http_status: 400, code: 123, subcode: 456 });
    expect(JSON.stringify(output.mock.calls)).not.toContain(PRIVATE);
  });

  it.each([
    { label: "structured 5xx", response: () => Response.json({ error: { code: 123, message: PRIVATE } }, { status: 503 }) },
    { label: "unstructured 4xx", response: () => new Response(PRIVATE, { status: 400 }) },
    { label: "2xx without WAMID", response: () => Response.json({ messages: [] }) },
    { label: "invalid 2xx JSON", response: () => new Response(PRIVATE, { status: 200 }) },
    { label: "null 2xx JSON", response: () => Response.json(null) },
  ])("classifies $label as uncertain and never retries", async ({ response }) => {
    fetchMock.mockResolvedValueOnce(response());
    await expect(sendTextMessage("synthetic-recipient", "Synthetic text")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events().map((event) => event.event)).toEqual(["send.attempt", "send.uncertain"]);
    expect(JSON.stringify(output.mock.calls)).not.toContain(PRIVATE);
  });

  it("does not mistake a transport error for rejection or leak its message", async () => {
    fetchMock.mockRejectedValueOnce(new Error(PRIVATE));
    await expect(sendTextMessage("synthetic-recipient", "Synthetic text")).rejects.toThrow("No se pudo confirmar el resultado");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events().map((event) => event.event)).toEqual(["send.attempt", "send.uncertain"]);
    expect(JSON.stringify(output.mock.calls)).not.toContain(PRIVATE);
  });

  it("records missing configuration as not attempted without invoking fetch", async () => {
    vi.stubEnv("META_ACCESS_TOKEN", undefined);
    await expect(sendTextMessage("synthetic-recipient", "Synthetic text")).rejects.toThrow("no están configurados");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(events().map((event) => event.event)).toEqual(["send.not_attempted"]);
  });

  it("labels a CTA without logging its private checkout URL", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ messages: [{ id: "synthetic-cta-id" }] }));
    await sendCatalogCtaMessage("synthetic-recipient", `https://catalog.invalid/?checkout=${PRIVATE}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events()[1].kind).toBe("cta_url");
    expect(JSON.stringify(output.mock.calls)).not.toContain(PRIVATE);
  });

  it("preserves token-expiry classification without retaining the provider text", () => {
    const error = new MetaGraphError(`Error: access token has expired ${PRIVATE}`, 400, 190, 463);
    expect(isExpiredMetaAccessToken(error)).toBe(true);
    expect(isExpiredMetaAccessToken(new MetaGraphError("Invalid parameter", 400, 100))).toBe(false);
    expect(isExpiredMetaAccessToken(new Error("access token has expired"))).toBe(false);
    expect(error.message).not.toContain(PRIVATE);
    expect(error.stack).not.toContain(PRIVATE);
    expect(JSON.stringify(error)).not.toContain(PRIVATE);
  });

  it("preserves the numeric outside24h marker used by the existing operator routes", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: 131047, message: PRIVATE } }, { status: 400 }));
    let received: unknown;
    try {
      await sendTextMessage("synthetic-recipient", "Synthetic text");
    } catch (error) {
      received = error;
    }
    expect(received).toBeInstanceOf(MetaGraphError);
    expect((received as MetaGraphError).message.includes("131047")).toBe(true);
    expect((received as MetaGraphError).message).not.toContain(PRIVATE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("discards unexpected runtime types rather than coercing them into messages or fields", () => {
    const injected = { toString: () => PRIVATE, toJSON: () => PRIVATE };
    const error = new MetaGraphError(
      injected as unknown as string,
      PRIVATE as unknown as number,
      injected as unknown as number,
      PRIVATE as unknown as number,
    );
    expect(error.status).toBe(0);
    expect(error.code).toBeUndefined();
    expect(error.subcode).toBeUndefined();
    expect(error.expiredAccessToken).toBe(false);
    expect(error.message).toContain("estado desconocido");
    expect(error.message).not.toContain(PRIVATE);
    expect(error.stack).not.toContain(PRIVATE);
    expect(JSON.stringify(error)).not.toContain(PRIVATE);
    const invalidNumbers = new MetaGraphError(PRIVATE, Number.POSITIVE_INFINITY, -1, 1.5);
    expect(invalidNumbers.status).toBe(0);
    expect(invalidNumbers.code).toBeUndefined();
    expect(invalidNumbers.subcode).toBeUndefined();
  });

  it("a failing diagnostic sink does not change an accepted send or start a retry", async () => {
    output.mockImplementation(() => { throw new Error("test-only-output-failure"); });
    fetchMock.mockResolvedValueOnce(Response.json({ messages: [{ id: "synthetic-accepted" }] }));
    await expect(sendTextMessage("synthetic-recipient", "Synthetic text")).resolves.toEqual({ wa_message_id: "synthetic-accepted" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
