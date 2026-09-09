import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  conversation: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  sendQr: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  reserveCatalogPaymentQrDelivery: mocks.reserve,
  getConversationById: mocks.conversation,
  completeCatalogPaymentQrDelivery: mocks.complete,
  failCatalogPaymentQrDelivery: mocks.fail,
}));

vi.mock("@/lib/payment-qr", () => ({ sendPaymentQr: mocks.sendQr }));

import { dispatchCatalogPaymentQr } from "./catalog-payment-flow";

describe("envío del QR de pago del catálogo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
    mocks.conversation.mockReturnValue({ id: 42, phone: "59170000000" });
    mocks.sendQr.mockResolvedValue({ waMessageId: "wamid.qr" });

    await expect(dispatchCatalogPaymentQr("order-1")).resolves.toBe("sent");
    expect(mocks.complete).toHaveBeenCalledWith("order-1", "wamid.qr");
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("deja el envío pendiente para reintento si no se puede obtener o enviar el QR", async () => {
    mocks.reserve.mockReturnValue({
      reservation: "reserved",
      order: { id: "order-1", conversation_id: 42, public_code: "T-7Q4K-8M2P" },
    });
    mocks.conversation.mockReturnValue({ id: 42, phone: "59170000000" });
    mocks.sendQr.mockRejectedValue(new Error("Storage unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(dispatchCatalogPaymentQr("order-1")).resolves.toBe("failed");
    expect(mocks.fail).toHaveBeenCalledWith("order-1");
    expect(mocks.complete).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
