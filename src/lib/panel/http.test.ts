import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getAsset, POST as retryAsset } from "@/app/api/panel/assets/[assetId]/route";
import { GET as getDossier } from "@/app/api/panel/dossier/[publicCode]/route";

const fixture = vi.hoisted(() => ({
  asset: vi.fn(), dossier: vi.fn(), read: vi.fn(), retry: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getPanelRepository: () => fixture }));
vi.mock("@/lib/panel/files", () => ({ readPrivateFile: fixture.read }));
vi.mock("@/lib/panel/service", () => ({ incomingAssets: { retry: fixture.retry } }));
const id = "a".repeat(32);
const context = { params: Promise.resolve({ assetId: id }) };
const auth = `Basic ${Buffer.from("test-operator:test-password").toString("base64")}`;
function request(path: string, headers: Record<string, string> = {}, method = "GET") {
  return new NextRequest(`https://panel.example${path}`, { method, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DASHBOARD_BASIC_AUTH_USER", "test-operator");
  vi.stubEnv("DASHBOARD_BASIC_AUTH_PASSWORD", "test-password");
  fixture.asset.mockReturnValue({ id, state: "ready", kind: "image", mime: "image/png", filename: "ejemplo.png", provider_id: "12345" });
  fixture.read.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
});
afterEach(() => vi.unstubAllEnvs());

describe("private panel routes", () => {
  it("denies file and dossier access before reading any client information", async () => {
    const image = await getAsset(request(`/api/panel/assets/${id}`), context);
    const order = await getDossier(request("/api/panel/dossier/T-DEMO-0001"), { params: Promise.resolve({ publicCode: "T-DEMO-0001" }) });
    expect(image.status).toBe(401);
    expect(order.status).toBe(401);
    expect(fixture.asset).not.toHaveBeenCalled();
    expect(fixture.dossier).not.toHaveBeenCalled();
    expect(fixture.read).not.toHaveBeenCalled();
  });

  it("fails closed when dashboard credentials are not configured", async () => {
    vi.stubEnv("DASHBOARD_BASIC_AUTH_PASSWORD", "");
    expect((await getAsset(request(`/api/panel/assets/${id}`, { authorization: auth }), context)).status).toBe(503);
    expect(fixture.read).not.toHaveBeenCalled();
  });

  it("serves images privately and forces PDFs to download", async () => {
    const image = await getAsset(request(`/api/panel/assets/${id}`, { authorization: auth }), context);
    expect(image.status).toBe(200);
    expect(image.headers.get("cache-control")).toBe("private, no-store");
    expect(image.headers.get("content-disposition")).toBe('inline; filename="ejemplo.png"');
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    expect(image.headers.get("referrer-policy")).toBe("no-referrer");
    expect(image.headers.get("content-security-policy")).toContain("sandbox");
    fixture.asset.mockReturnValue({ id, state: "ready", kind: "document", mime: "application/pdf", filename: "prueba.pdf" });
    const document = await getAsset(request(`/api/panel/assets/${id}`, { authorization: auth }), context);
    expect(document.headers.get("content-disposition")).toBe('attachment; filename="prueba.pdf"');
  });

  it("blocks a cross-origin recovery even when browser authentication is present", async () => {
    const origins: Record<string, string>[] = [
      { origin: "https://other.example", "x-terra-panel": "1" },
      { "sec-fetch-site": "cross-site", "x-terra-panel": "1" },
      { origin: "https://panel.example" },
    ];
    for (const headers of origins) {
      const response = await retryAsset(request(`/api/panel/assets/${id}`, { authorization: auth, ...headers }, "POST"), context);
      expect(response.status).toBe(403);
    }
    expect(fixture.retry).not.toHaveBeenCalled();
  });

  it("recovers only a known incoming file on an authenticated operator request", async () => {
    const response = await retryAsset(request(`/api/panel/assets/${id}`, {
      authorization: auth, origin: "https://panel.example", "x-terra-panel": "1",
    }, "POST"), context);
    expect(await response.json()).toEqual({ ok: true });
    expect(fixture.retry).toHaveBeenCalledExactlyOnceWith(id, true);
  });
});
