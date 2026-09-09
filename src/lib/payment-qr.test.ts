import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signedUrl: vi.fn(),
  sendImage: vi.fn(),
  insertMessage: vi.fn(),
}));

vi.mock("@/lib/supabase-qr", () => ({ getPaymentQrSignedUrl: mocks.signedUrl }));
vi.mock("@/lib/meta/client", () => ({ sendImageMessage: mocks.sendImage }));
vi.mock("@/lib/db", () => ({ insertMessage: mocks.insertMessage }));

import { sendPaymentQr } from "./payment-qr";

describe("registro del QR de pago", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.signedUrl.mockResolvedValue({ signedUrl: "https://example.test/payment-qr.jpeg" });
  });

  it("no registra un QR como enviado cuando Meta rechaza el envío", async () => {
    mocks.sendImage.mockRejectedValue(new Error("Graph unavailable"));

    await expect(sendPaymentQr(4, "59170000000")).rejects.toThrow("Graph unavailable");
    expect(mocks.insertMessage).not.toHaveBeenCalled();
  });

  it("registra el QR solamente después de recibir su id de WhatsApp", async () => {
    mocks.sendImage.mockResolvedValue({ wa_message_id: "wamid.qr" });

    await expect(sendPaymentQr(4, "59170000000")).resolves.toEqual({ waMessageId: "wamid.qr" });
    expect(mocks.insertMessage).toHaveBeenCalledWith(4, "assistant", "QR de pago enviado.", "wamid.qr");
  });
});
