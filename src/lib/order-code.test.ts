import { describe, expect, it } from "vitest";
import { createPublicOrderCode, normalizePublicOrderCode, parseOrderConfirmationCode } from "./order-code";

describe("código público de pedido", () => {
  it("genera un código corto que no expone el identificador interno", () => {
    expect(createPublicOrderCode()).toMatch(/^T-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("extrae el código del mensaje que abre WhatsApp", () => {
    expect(parseOrderConfirmationCode("Hola Terra, confirmo mi pedido #t-7q4k-8m2p")).toBe("T-7Q4K-8M2P");
    expect(normalizePublicOrderCode("pedido-123")).toBeNull();
  });
});
