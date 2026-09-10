import { describe, expect, it } from "vitest";
import { saleFlowResume } from "./resume";

describe("retorno al flujo de venta", () => {
  it("retoma GPS después de una duda comercial", () => {
    expect(saleFlowResume({ public_code: "T-7Q4K-8M2P", status: "awaiting_location", location_requested: 1, latitude: null, longitude: null }))
      .toContain("comparte tu ubicación");
  });

  it("no promete aprobación cuando el comprobante está en revisión", () => {
    expect(saleFlowResume({ public_code: "T-7Q4K-8M2P", status: "payment_proof_received", location_requested: 1, latitude: 1, longitude: 1 }))
      .toContain("no se aprueba automáticamente");
  });
});
