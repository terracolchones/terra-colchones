import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fixture = vi.hoisted(() => ({
  mode: "HUMAN" as "AI" | "HUMAN",
  delivery: "available" as "available" | "sending" | "sent" | "failed",
  hasOrder: true,
  conversation: vi.fn(), order: vi.fn(), reserve: vi.fn(), complete: vi.fn(), fail: vi.fn(), insert: vi.fn(),
  signedUrl: vi.fn(), sendImage: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getConversationById: fixture.conversation,
  getLatestActiveCatalogOrderForConversation: fixture.order,
  reserveCatalogPaymentQrDelivery: fixture.reserve,
  completeCatalogPaymentQrDelivery: fixture.complete,
  failCatalogPaymentQrDelivery: fixture.fail,
  insertMessage: fixture.insert,
}));
vi.mock("@/lib/supabase-qr", () => ({ getPaymentQrSignedUrl: fixture.signedUrl }));
vi.mock("@/lib/meta/client", () => ({ sendImageMessage: fixture.sendImage }));

import { POST } from "./route";
import { dispatchCatalogPaymentQr } from "@/lib/catalog-payment-flow";

function call(headers: Record<string, string> = {}) {
  return POST(new NextRequest("https://agent.invalid/api/payment-qr/4", { method: "POST", headers: {
    authorization: `Basic ${Buffer.from("synthetic:local-test").toString("base64")}`,
    origin: "https://agent.invalid", "sec-fetch-site": "same-origin", "x-terra-order-code": "T-TEST-DEMO", ...headers,
  } }), { params: Promise.resolve({ conversationId: "4" }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  fixture.mode = "HUMAN";
  fixture.delivery = "available";
  fixture.hasOrder = true;
  vi.stubEnv("DASHBOARD_BASIC_AUTH_USER", "synthetic");
  vi.stubEnv("DASHBOARD_BASIC_AUTH_PASSWORD", "local-test");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  fixture.conversation.mockImplementation(() => ({ id: 4, phone: "synthetic-recipient", mode: fixture.mode }));
  fixture.order.mockImplementation(() => fixture.hasOrder ? { id: "synthetic-order", conversation_id: 4, public_code: "T-TEST-DEMO" } : undefined);
  fixture.reserve.mockImplementation(() => {
    const reservation = fixture.delivery === "sent" ? "already_sent" : fixture.delivery === "sending" ? "in_progress" : "reserved";
    if (reservation === "reserved") fixture.delivery = "sending";
    return { reservation, order: fixture.order() };
  });
  fixture.complete.mockImplementation(() => { fixture.delivery = "sent"; });
  fixture.fail.mockImplementation(() => { fixture.delivery = "failed"; });
  fixture.signedUrl.mockResolvedValue({ signedUrl: "https://storage.invalid/synthetic-qr" });
  fixture.sendImage.mockResolvedValue({ wa_message_id: "synthetic-accepted" });
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("manual QR uses the same order reservation as automatic delivery", () => {
  it("rejects unauthenticated and cross-origin calls before reading conversation data", async () => {
    expect((await call({ authorization: "" })).status).toBe(401);
    expect((await call({ origin: "https://other.invalid" })).status).toBe(403);
    expect((await call({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(fixture.conversation).not.toHaveBeenCalled();
    expect(fixture.sendImage).not.toHaveBeenCalled();
  });

  it("requires HUMAN and an associated catalog order", async () => {
    fixture.mode = "AI";
    expect((await call()).status).toBe(409);
    fixture.mode = "HUMAN";
    fixture.hasOrder = false;
    expect((await call()).status).toBe(409);
    expect(fixture.reserve).not.toHaveBeenCalled();
    expect(fixture.sendImage).not.toHaveBeenCalled();
  });

  it("does not bypass the confirmed-order and GPS requirement", async () => {
    fixture.reserve.mockReturnValue({ reservation: "not_ready", order: fixture.order() });
    const response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("ubicación registrada");
    expect(fixture.sendImage).not.toHaveBeenCalled();
  });

  it("rejects a stale panel selection before reserving or sending a different order", async () => {
    expect((await call({ "x-terra-order-code": "" })).status).toBe(400);
    expect((await call({ "x-terra-order-code": "T-OTRO-DEMO" })).status).toBe(409);
    expect(fixture.reserve).not.toHaveBeenCalled();
    expect(fixture.sendImage).not.toHaveBeenCalled();
  });

  it("sends once for two concurrent manual requests and subsequent retries", async () => {
    const results = await Promise.all([call(), call()]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(fixture.sendImage).toHaveBeenCalledTimes(1);
    expect(fixture.complete).toHaveBeenCalledExactlyOnceWith("synthetic-order", "synthetic-accepted");
    expect((await call()).status).toBe(409);
    expect(fixture.sendImage).toHaveBeenCalledTimes(1);
  });

  it("does not send another QR manually after the automatic send was accepted", async () => {
    fixture.mode = "AI";
    expect(await dispatchCatalogPaymentQr("synthetic-order")).toBe("sent");
    fixture.mode = "HUMAN";
    expect((await call()).status).toBe(409);
    expect(fixture.sendImage).toHaveBeenCalledTimes(1);
  });

  it("shares an in-flight reservation with a manual call after automatic preparation started", async () => {
    let release!: (value: { signedUrl: string }) => void;
    fixture.signedUrl.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    fixture.mode = "AI";
    const automatic = dispatchCatalogPaymentQr("synthetic-order");
    fixture.mode = "HUMAN";
    expect((await call()).status).toBe(409);
    release({ signedUrl: "https://storage.invalid/synthetic-qr" });
    expect(await automatic).toBe("suppressed");
    expect(fixture.sendImage).not.toHaveBeenCalled();
    expect(fixture.fail).toHaveBeenCalledExactlyOnceWith("synthetic-order");
  });

  it("rechecks HUMAN after preparing a manual QR and cancels before Meta if the mode changed", async () => {
    fixture.signedUrl.mockImplementation(async () => {
      fixture.mode = "AI";
      return { signedUrl: "https://storage.invalid/synthetic-qr" };
    });
    expect((await call()).status).toBe(409);
    expect(fixture.sendImage).not.toHaveBeenCalled();
    expect(fixture.complete).not.toHaveBeenCalled();
    expect(fixture.fail).toHaveBeenCalledTimes(1);
  });

  it("preserves uncertainty instead of making the manual QR retryable", async () => {
    fixture.sendImage.mockRejectedValue(new Error("synthetic-private-provider-data"));
    const response = await call();
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain("synthetic-private");
    expect((await call()).status).toBe(409);
    expect(fixture.sendImage).toHaveBeenCalledTimes(1);
    expect(fixture.fail).not.toHaveBeenCalled();
    expect(fixture.complete).not.toHaveBeenCalled();
  });

  it("does not repeat an accepted QR when completion persistence fails", async () => {
    fixture.complete.mockImplementation(() => { throw new Error("synthetic-private-database-path"); });
    const response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Meta aceptó");
    expect((await call()).status).toBe(409);
    expect(fixture.sendImage).toHaveBeenCalledTimes(1);
    expect(fixture.fail).not.toHaveBeenCalled();
  });

  it("releases only a preparation failure before any send attempt", async () => {
    fixture.signedUrl.mockRejectedValueOnce(new Error("synthetic-private-storage-data"));
    const response = await call();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("synthetic-private");
    expect(fixture.sendImage).not.toHaveBeenCalled();
    expect(fixture.fail).toHaveBeenCalledTimes(1);
    expect((await call()).status).toBe(200);
    expect(fixture.sendImage).toHaveBeenCalledTimes(1);
  });
});
