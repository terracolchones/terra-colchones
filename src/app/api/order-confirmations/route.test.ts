import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Importing this retired route cannot initialize any live adapter.
vi.mock("@/lib/db", () => { throw new Error("Retired route must not import SQLite."); });
vi.mock("@/lib/payment-qr", () => { throw new Error("Retired route must not import QR delivery."); });
vi.mock("@/lib/meta/client", () => { throw new Error("Retired route must not import Meta."); });

import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

function request(token?: string, body = "not-json") {
  return new NextRequest("https://agent.invalid/api/order-confirmations", {
    method: "POST", body, headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("retired external order confirmation", () => {
  it("fails closed without configuration or with incorrect authorization", async () => {
    vi.stubEnv("ORDER_CONFIRMATION_TOKEN", "");
    expect((await POST(request("synthetic-token"))).status).toBe(401);
    vi.stubEnv("ORDER_CONFIRMATION_TOKEN", "synthetic-token");
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("wrong-token"))).status).toBe(401);
  });

  it("returns 410 for every authenticated retry without reading customer data or sending messages", async () => {
    vi.stubEnv("ORDER_CONFIRMATION_TOKEN", "synthetic-token");
    for (const body of ["not-json", "null", '{"orderId":"synthetic-order","customerPhone":"synthetic-recipient"}']) {
      const incoming = request("synthetic-token", body);
      const parse = vi.spyOn(incoming, "json");
      const result = await POST(incoming);
      expect(result.status).toBe(410);
      expect(result.headers.get("cache-control")).toBe("no-store");
      expect(parse).not.toHaveBeenCalled();
      expect(JSON.stringify(await result.json())).not.toContain("synthetic");
    }
  });
});
