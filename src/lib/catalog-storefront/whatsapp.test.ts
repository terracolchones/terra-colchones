import { describe, expect, it } from "vitest";
import { buildOrderConfirmationWhatsAppUrl } from "./whatsapp";

describe("enlace de pedido por WhatsApp", () => {
  it("envía el mensaje corto y nunca los identificadores internos", () => {
    const url = buildOrderConfirmationWhatsAppUrl("T-7Q4K-8M2P", "59170000000");
    const message = new URL(url ?? "").searchParams.get("text");

    expect(message).toBe("Hola Terra, confirmo mi pedido #T-7Q4K-8M2P");
    expect(message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it("rechaza códigos que no tienen el formato público", () => {
    expect(buildOrderConfirmationWhatsAppUrl("TERRA-CAT:secreto", "59170000000")).toBeNull();
  });
});
