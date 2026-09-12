import { afterEach, describe, expect, it, vi } from "vitest";
import { getCatalogWhatsAppPhone } from "./contact";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("destino comercial del catálogo", () => {
  it("usa el número configurado sin consultar el canal Meta del catálogo", async () => {
    vi.stubEnv("TERRA_WHATSAPP_PHONE", "+591 70000001");
    vi.stubEnv("NEXT_PUBLIC_TERRA_WHATSAPP_PHONE", "15550000000");
    vi.stubEnv("META_PHONE_NUMBER_ID", "test-channel");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await getCatalogWhatsAppPhone()).toBe("59170000001");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("acepta la configuración pública anterior si no hay configuración privada", async () => {
    vi.stubEnv("TERRA_WHATSAPP_PHONE", "");
    vi.stubEnv("NEXT_PUBLIC_TERRA_WHATSAPP_PHONE", "59170000002");
    expect(await getCatalogWhatsAppPhone()).toBe("59170000002");
  });

  it("no inventa un destino si faltan números válidos", async () => {
    vi.stubEnv("TERRA_WHATSAPP_PHONE", "inválido");
    vi.stubEnv("NEXT_PUBLIC_TERRA_WHATSAPP_PHONE", "");
    expect(await getCatalogWhatsAppPhone()).toBeNull();
  });
});
