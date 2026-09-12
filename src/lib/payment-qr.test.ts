import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signedUrl: vi.fn(),
  sendImage: vi.fn(),
  insertMessage: vi.fn(),
  conversation: vi.fn(),
}));

vi.mock("@/lib/supabase-qr", () => ({ getPaymentQrSignedUrl: mocks.signedUrl }));
vi.mock("@/lib/meta/client", () => ({ sendImageMessage: mocks.sendImage }));
vi.mock("@/lib/db", () => ({ insertMessage: mocks.insertMessage, getConversationById: mocks.conversation }));

import { PaymentQrPreparationError, sendPaymentQr } from "./payment-qr";

describe("registro del QR de pago", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.signedUrl.mockResolvedValue({ signedUrl: "https://example.test/payment-qr.jpeg" });
    mocks.conversation.mockReturnValue({ id: 4, mode: "AI" });
  });

  it("no registra un QR como enviado cuando Meta rechaza el envío", async () => {
    mocks.sendImage.mockRejectedValue(new Error("Graph unavailable"));

    await expect(sendPaymentQr(4, "synthetic-recipient")).rejects.toThrow("Graph unavailable");
    expect(mocks.insertMessage).not.toHaveBeenCalled();
  });

  it("registra el QR solamente después de recibir su id de WhatsApp", async () => {
    mocks.sendImage.mockResolvedValue({ wa_message_id: "wamid.qr" });

    await expect(sendPaymentQr(4, "synthetic-recipient")).resolves.toEqual({ waMessageId: "wamid.qr" });
    expect(mocks.insertMessage).toHaveBeenCalledWith(4, "assistant", "QR de pago enviado.", "wamid.qr");
  });

  it("no obtiene ni envía un QR automático si el chat ya está en HUMAN", async () => {
    mocks.conversation.mockReturnValue({ id: 4, mode: "HUMAN" });
    await expect(sendPaymentQr(4, "synthetic-recipient", undefined, { requireAiMode: true })).resolves.toBeNull();
    expect(mocks.signedUrl).not.toHaveBeenCalled();
    expect(mocks.sendImage).not.toHaveBeenCalled();
    expect(mocks.insertMessage).not.toHaveBeenCalled();
  });

  it("cancela el QR automático si el operador toma el chat durante la URL firmada", async () => {
    mocks.signedUrl.mockImplementation(async () => {
      mocks.conversation.mockReturnValue({ id: 4, mode: "HUMAN" });
      return { signedUrl: "https://example.test/payment-qr.jpeg" };
    });
    await expect(sendPaymentQr(4, "synthetic-recipient", undefined, { requireAiMode: true })).resolves.toBeNull();
    expect(mocks.conversation).toHaveBeenCalledTimes(2);
    expect(mocks.sendImage).not.toHaveBeenCalled();
    expect(mocks.insertMessage).not.toHaveBeenCalled();
  });

  it("conserva el envío manual intencional del operador aunque el chat esté en HUMAN", async () => {
    mocks.conversation.mockReturnValue({ id: 4, mode: "HUMAN" });
    mocks.sendImage.mockResolvedValue({ wa_message_id: "wamid.manual" });
    await expect(sendPaymentQr(4, "synthetic-recipient")).resolves.toEqual({ waMessageId: "wamid.manual" });
    expect(mocks.sendImage).toHaveBeenCalledTimes(1);
    expect(mocks.conversation).not.toHaveBeenCalled();
  });

  it("envía el QR automático si el chat continúa en AI después de preparar la URL", async () => {
    mocks.sendImage.mockResolvedValue({ wa_message_id: "wamid.automatic" });
    await expect(sendPaymentQr(4, "synthetic-recipient", undefined, { requireAiMode: true })).resolves.toEqual({ waMessageId: "wamid.automatic" });
    expect(mocks.sendImage).toHaveBeenCalledTimes(1);
    expect(mocks.conversation).toHaveBeenCalledTimes(2);
  });

  it("clasifica como preparación fallida la URL firmada sin intentar enviar a Meta", async () => {
    mocks.signedUrl.mockRejectedValue(new Error("Synthetic storage unavailable"));
    await expect(sendPaymentQr(4, "synthetic-recipient")).rejects.toBeInstanceOf(PaymentQrPreparationError);
    expect(mocks.sendImage).not.toHaveBeenCalled();
  });

  it("no conserva contenido remoto sensible en message, String ni cause del error", async () => {
    const syntheticPrivateValue = "synthetic-signed-url-secret-never-log";
    mocks.signedUrl.mockRejectedValue(new Error(syntheticPrivateValue));
    const error = await sendPaymentQr(4, "synthetic-recipient").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PaymentQrPreparationError);
    expect(String(error)).not.toContain(syntheticPrivateValue);
    expect((error as Error).message).not.toContain(syntheticPrivateValue);
    expect((error as Error).cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain(syntheticPrivateValue);
    expect(mocks.sendImage).not.toHaveBeenCalled();
  });

  it("conserva la aceptación de Meta si falla el historial local y no reenvía", async () => {
    mocks.sendImage.mockResolvedValue({ wa_message_id: "wamid.accepted" });
    mocks.insertMessage.mockImplementation(() => { throw new Error("Synthetic DB failure"); });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(sendPaymentQr(4, "synthetic-recipient")).resolves.toEqual({ waMessageId: "wamid.accepted" });
      expect(mocks.sendImage).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });
});
