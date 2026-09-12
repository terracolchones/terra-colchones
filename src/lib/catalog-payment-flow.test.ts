import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  conversation: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  sendQr: vi.fn(),
  PreparationError: class extends Error {},
}));

vi.mock("@/lib/db", () => ({
  reserveCatalogPaymentQrDelivery: mocks.reserve,
  getConversationById: mocks.conversation,
  completeCatalogPaymentQrDelivery: mocks.complete,
  failCatalogPaymentQrDelivery: mocks.fail,
}));

vi.mock("@/lib/payment-qr", () => ({ sendPaymentQr: mocks.sendQr, PaymentQrPreparationError: mocks.PreparationError }));

import { dispatchCatalogPaymentQr } from "./catalog-payment-flow";

describe("envío del QR de pago del catálogo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.reserve.mockReturnValue({
      reservation: "reserved",
      order: { id: "order-1", conversation_id: 42, public_code: "T-7Q4K-8M2P" },
    });
    mocks.conversation.mockReturnValue({ id: 42, phone: "synthetic-recipient", mode: "AI" });
  });

  it("no envía nada cuando el pedido todavía no tiene GPS", async () => {
    mocks.reserve.mockReturnValue({ reservation: "not_ready", order: undefined });

    await expect(dispatchCatalogPaymentQr("order-1")).resolves.toBe("not_ready");
    expect(mocks.sendQr).not.toHaveBeenCalled();
  });

  it("marca el pedido como listo para pago solo después de que Meta acepta el QR", async () => {
    mocks.reserve.mockReturnValue({
      reservation: "reserved",
      order: { id: "order-1", conversation_id: 42, public_code: "T-7Q4K-8M2P" },
    });
    mocks.sendQr.mockResolvedValue({ waMessageId: "wamid.qr" });

    await expect(dispatchCatalogPaymentQr("order-1")).resolves.toBe("sent");
    expect(mocks.complete).toHaveBeenCalledWith("order-1", "wamid.qr");
    expect(mocks.fail).not.toHaveBeenCalled();
    expect(mocks.sendQr).toHaveBeenCalledWith(42, "synthetic-recipient", expect.any(String), { requireAiMode: true });
  });

  it("libera la reserva solo cuando falla la preparación antes de intentar enviar el QR", async () => {
    mocks.reserve.mockReturnValue({
      reservation: "reserved",
      order: { id: "order-1", conversation_id: 42, public_code: "T-7Q4K-8M2P" },
    });
    mocks.sendQr.mockRejectedValue(new mocks.PreparationError("Synthetic storage unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(dispatchCatalogPaymentQr("order-1")).resolves.toBe("failed");
    expect(mocks.fail).toHaveBeenCalledWith("order-1");
    expect(mocks.complete).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("no envía el QR automático si un operador tomó el chat", async () => {
    mocks.conversation.mockReturnValue({ id: 42, phone: "synthetic-recipient", mode: "HUMAN" });
    await expect(dispatchCatalogPaymentQr("order-1")).resolves.toBe("suppressed");
    expect(mocks.sendQr).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("conserva la cancelación si cambió a HUMAN durante la preparación del QR", async () => {
    mocks.sendQr.mockResolvedValue(null);
    await expect(dispatchCatalogPaymentQr("order-1")).resolves.toBe("suppressed");
    expect(mocks.fail).toHaveBeenCalledWith("order-1");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("no marca fallido ni solicita fallback ante un resultado de envío incierto", async () => {
    mocks.sendQr.mockRejectedValue(new Error("Synthetic network timeout"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(dispatchCatalogPaymentQr("order-1")).resolves.toBe("uncertain");
      expect(mocks.fail).not.toHaveBeenCalled();
      expect(mocks.complete).not.toHaveBeenCalled();
      expect(mocks.sendQr).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });

  it("no marca fallido ni reenvía cuando Meta aceptó pero falla el cierre local", async () => {
    mocks.sendQr.mockResolvedValue({ waMessageId: "wamid.accepted" });
    mocks.complete.mockImplementation(() => { throw new Error("Synthetic DB failure"); });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(dispatchCatalogPaymentQr("order-1")).resolves.toBe("accepted_persistence_failed");
      expect(mocks.fail).not.toHaveBeenCalled();
      expect(mocks.sendQr).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });
});
