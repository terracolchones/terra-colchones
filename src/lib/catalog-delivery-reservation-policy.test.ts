import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalogDeliveryReservationState, type CatalogDeliveryAttempt } from "./catalog-delivery-reservation-policy";

// Pure policy used by both reserveCatalogLocationRequest and
// reserveCatalogPaymentQrDelivery. No database module is imported or opened.
describe("política de reserva compartida por GPS y QR", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    { status: "sending", age: 1, expected: "in_progress" },
    { status: "sending", age: 300, expected: "in_progress" },
    { status: "sending", age: 301, expected: "in_progress" },
    { status: "sending", age: 86400, expected: "in_progress" },
    { status: "sent", age: 1, expected: "already_sent" },
    { status: "sent", age: 86400, expected: "already_sent" },
    { status: "failed", age: 1, expected: "available" },
    { status: "failed", age: 86400, expected: "available" },
  ] as const)("$status con $age segundos conserva $expected", ({ status, age, expected }) => {
    const attempt: CatalogDeliveryAttempt = { status, updated_at: Date.now() / 1000 - age };
    expect(catalogDeliveryReservationState(attempt)).toBe(expected);
  });

  it("permite la primera reserva cuando todavía no existe intento", () => {
    expect(catalogDeliveryReservationState(undefined)).toBe("available");
  });

  it("un intento incierto no se reactiva aunque transcurran varios días", () => {
    const attempt: CatalogDeliveryAttempt = { status: "sending", updated_at: Date.now() / 1000 };
    expect(catalogDeliveryReservationState(attempt)).toBe("in_progress");
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);
    expect(catalogDeliveryReservationState(attempt)).toBe("in_progress");
    expect(attempt.status).toBe("sending");
  });
});
