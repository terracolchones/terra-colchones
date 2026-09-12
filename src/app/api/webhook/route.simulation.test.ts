import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handler = vi.hoisted(() => ({
  processWebhookPayload: vi.fn<(payload: unknown, origin: string) => Promise<void>>(),
}));

// The business handler is fully replaced: no database, customer data, Meta,
// OpenAI, catalog lookup or outgoing message is reachable from these tests.
// The route and its real HMAC verification are deliberately NOT mocked.
vi.mock("@/lib/meta/handler", () => handler);

import { GET, POST } from "./route";

const APP_SECRET = "test-only-webhook-hmac-secret-not-a-credential";
const VERIFY_TOKEN = "test-only-webhook-verification-token";
const ORIGIN = "https://terra-simulation.invalid";
const PAYLOAD = { object: "whatsapp_business_account", entry: [] };

function signatureFor(body: string, secret = APP_SECRET) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

function postRequest(body: string, signature: string | null = signatureFor(body)) {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set("x-hub-signature-256", signature);
  // Constructing a NextRequest does not send an HTTP request or open a server.
  return new NextRequest(`${ORIGIN}/api/webhook`, {
    method: "POST",
    headers,
    body,
  });
}

function getRequest(parameters: Record<string, string>) {
  const url = new URL("/api/webhook", ORIGIN);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

function deferredProcessing() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  handler.processWebhookPayload.mockReset();
  handler.processWebhookPayload.mockResolvedValue(undefined);
  vi.stubEnv("META_APP_SECRET", APP_SECRET);
  vi.stubEnv("META_VERIFY_TOKEN", VERIFY_TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("local simulation: webhook verification GET", () => {
  it("returns the plain-text challenge for the synthetic verification token", async () => {
    const response = await GET(getRequest({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "test-only-challenge",
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("test-only-challenge");
    expect(handler.processWebhookPayload).not.toHaveBeenCalled();
  });

  it.each([
    { name: "incorrect token", parameters: { "hub.mode": "subscribe", "hub.verify_token": "test-only-wrong-token" } },
    { name: "incorrect mode", parameters: { "hub.mode": "unsubscribe", "hub.verify_token": VERIFY_TOKEN } },
    { name: "missing token", parameters: { "hub.mode": "subscribe" } },
  ])("rejects $name without dispatching an event", async ({ parameters }) => {
    const response = await GET(getRequest(parameters as Record<string, string>));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("forbidden");
    expect(handler.processWebhookPayload).not.toHaveBeenCalled();
  });

  it("characterizes the current empty challenge response when the token matches", async () => {
    const response = await GET(getRequest({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(handler.processWebhookPayload).not.toHaveBeenCalled();
  });
});

describe("local simulation: signed webhook POST", () => {
  it("fails closed when the application secret is absent", async () => {
    vi.stubEnv("META_APP_SECRET", undefined);

    const response = await POST(postRequest(JSON.stringify(PAYLOAD)));

    expect(response.status).toBe(503);
    expect(handler.processWebhookPayload).not.toHaveBeenCalled();
  });

  it.each([
    { name: "missing signature", signature: null },
    { name: "wrong HMAC", signature: signatureFor(JSON.stringify(PAYLOAD), "test-only-different-secret") },
    { name: "malformed HMAC", signature: "sha256=not-a-hex-digest" },
  ])("rejects $name before business processing", async ({ signature }) => {
    const response = await POST(postRequest(JSON.stringify(PAYLOAD), signature));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("invalid signature");
    expect(handler.processWebhookPayload).not.toHaveBeenCalled();
  });

  it("checks the original body bytes, including otherwise harmless whitespace", async () => {
    const body = JSON.stringify(PAYLOAD);
    const response = await POST(postRequest(`${body} `, signatureFor(body)));

    expect(response.status).toBe(401);
    expect(handler.processWebhookPayload).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON even when its raw-body HMAC is valid", async () => {
    const response = await POST(postRequest('{"object":'));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("bad json");
    expect(handler.processWebhookPayload).not.toHaveBeenCalled();
  });

  it("dispatches a valid signed payload exactly once with its synthetic origin", async () => {
    const response = await POST(postRequest(JSON.stringify(PAYLOAD)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(handler.processWebhookPayload).toHaveBeenCalledExactlyOnceWith(PAYLOAD, ORIGIN);
  });

  it("characterizes acknowledgement before the pending business operation finishes", async () => {
    const pending = deferredProcessing();
    let processingFinished = false;
    handler.processWebhookPayload.mockImplementationOnce(async () => {
      await pending.promise;
      processingFinished = true;
    });

    try {
      const response = await POST(postRequest(JSON.stringify(PAYLOAD)));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(handler.processWebhookPayload).toHaveBeenCalledTimes(1);
      expect(processingFinished).toBe(false);
    } finally {
      pending.resolve();
      await pending.promise;
    }

    expect(processingFinished).toBe(true);
    // This proves early acknowledgement only, not durable delivery or recovery
    // after a process restart. It also does not reproduce a Meta restriction.
  });

  it("handles a later processing rejection without changing the already returned 200", async () => {
    const pending = deferredProcessing();
    const failure = new Error("test-only simulated processing failure");
    const errorLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
    handler.processWebhookPayload.mockReturnValueOnce(pending.promise);

    try {
      const response = await POST(postRequest(JSON.stringify(PAYLOAD)));
      expect(response.status).toBe(200);
      expect(errorLog).toHaveBeenCalledTimes(1);

      pending.reject(failure);
      // Let the route's catch callback run. Vitest also fails the suite if an
      // unhandled rejection escapes; no global rejection handler hides errors.
      await Promise.resolve();

      expect(errorLog).toHaveBeenCalledTimes(2);
      expect(errorLog.mock.calls.map((call) => JSON.parse(String(call[1])).event)).toEqual([
        "webhook.accepted", "webhook.processing_failed",
      ]);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(failure.message);
      expect(response.status).toBe(200);
      expect(handler.processWebhookPayload).toHaveBeenCalledTimes(1);
    } finally {
      pending.resolve();
      errorLog.mockRestore();
    }
  });
});
