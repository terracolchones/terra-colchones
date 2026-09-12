import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(), conversation: vi.fn(), complete: vi.fn(), fail: vi.fn(), send: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  reserveCatalogLocationRequest: mocks.reserve,
  getConversationById: mocks.conversation,
  completeCatalogLocationRequest: mocks.complete,
  failCatalogLocationRequest: mocks.fail,
}));
vi.mock("@/lib/meta/client", () => ({ sendLocationRequestMessage: mocks.send }));

import { dispatchCatalogLocationRequest } from "./catalog-order-flow";

describe("envío automático de GPS", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.reserve.mockReturnValue({
      reservation: "reserved",
      order: { id: "synthetic-order", conversation_id: 4, product_name: "Synthetic product" },
    });
    mocks.conversation.mockReturnValue({ id: 4, phone: "synthetic-recipient", mode: "AI" });
    mocks.send.mockResolvedValue({ wa_message_id: "wamid.synthetic-gps" });
  });

  it("no envía cuando el pedido no está listo", async () => {
    mocks.reserve.mockReturnValue({ reservation: "not_ready" });
    await expect(dispatchCatalogLocationRequest("synthetic-order")).resolves.toBe("not_ready");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("no repite una solicitud que ya fue enviada", async () => {
    mocks.reserve.mockReturnValue({ reservation: "already_sent" });
    await expect(dispatchCatalogLocationRequest("synthetic-order")).resolves.toBe("already_sent");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("no envía el GPS cuando el operador tiene el chat", async () => {
    mocks.conversation.mockReturnValue({ id: 4, phone: "synthetic-recipient", mode: "HUMAN" });
    await expect(dispatchCatalogLocationRequest("synthetic-order")).resolves.toBe("suppressed");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("persiste el GPS una vez después de la aceptación de Meta", async () => {
    await expect(dispatchCatalogLocationRequest("synthetic-order")).resolves.toBe("sent");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledWith("synthetic-order", "wamid.synthetic-gps");
    expect(mocks.fail).not.toHaveBeenCalled();
    expect(mocks.send.mock.invocationCallOrder[0]).toBeLessThan(mocks.complete.mock.invocationCallOrder[0]);
  });

  it("mantiene reservado un envío incierto sin marcarlo fallido ni enviar fallback", async () => {
    mocks.send.mockRejectedValue(new Error("Synthetic transport timeout"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(dispatchCatalogLocationRequest("synthetic-order")).resolves.toBe("uncertain");
      expect(mocks.fail).not.toHaveBeenCalled();
      expect(mocks.complete).not.toHaveBeenCalled();
      expect(mocks.send).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });

  it("no marca fallido un GPS aceptado cuando falla la persistencia final", async () => {
    mocks.complete.mockImplementation(() => { throw new Error("Synthetic DB failure"); });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(dispatchCatalogLocationRequest("synthetic-order")).resolves.toBe("accepted_persistence_failed");
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(mocks.fail).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
