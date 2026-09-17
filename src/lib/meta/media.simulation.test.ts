import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadPanelMedia, uploadPanelMedia, sendPanelMedia } from "./client";
import { MAX_FILE_BYTES } from "@/lib/panel/contracts";

const fetchMock = vi.fn<typeof fetch>();
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("META_PHONE_NUMBER_ID", "test-channel");
  vi.stubEnv("META_ACCESS_TOKEN", "test-token");
  vi.stubEnv("META_GRAPH_VERSION", "v25.0");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("offline WhatsApp media transport", () => {
  it("uploads a private binary first and sends the resulting provider ID", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: "12345" }))
      .mockResolvedValueOnce(Response.json({ messages: [{ id: "synthetic-wamid" }] }));
    const id = await uploadPanelMedia(png, "image/png", "ejemplo.png");
    await sendPanelMedia("synthetic-recipient", id, "image/png", "ejemplo.png", "Prueba");
    expect(fetchMock.mock.calls[0][0]).toBe("https://graph.facebook.com/v25.0/test-channel/media");
    const form = fetchMock.mock.calls[0][1]!.body as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect((form.get("file") as File).size).toBe(png.length);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]!.body))).toMatchObject({ type: "image", image: { id: "12345", caption: "Prueba" } });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("/api/panel/assets");
  });

  it("retrieves a fresh provider URL and bounds the authenticated binary download", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=12345" }))
      .mockResolvedValueOnce(new Response(png));
    expect(await downloadPanelMedia("12345", "image/png")).toEqual(png);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer test-token" } });
  });

  it.each(["http://lookaside.fbsbx.com/file", "https://lookaside.fbsbx.com.evil.example/file", "https://other.example/file", "https://user:pass@lookaside.fbsbx.com/file"])("does not forward credentials to %s", async (url) => {
    fetchMock.mockResolvedValueOnce(Response.json({ url }));
    await expect(downloadPanelMedia("12345", "image/png")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized or mismatched provider files", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ url: "https://lookaside.fbsbx.com/file" }))
      .mockResolvedValueOnce(new Response(png, { headers: { "content-length": String(MAX_FILE_BYTES + 1) } }));
    await expect(downloadPanelMedia("12345", "image/png")).rejects.toThrow(/grande/);
    fetchMock.mockResolvedValueOnce(Response.json({ url: "https://lookaside.fbsbx.com/file" }))
      .mockResolvedValueOnce(new Response("<html>no image</html>"));
    await expect(downloadPanelMedia("12345", "image/png")).rejects.toThrow();
  });
});
