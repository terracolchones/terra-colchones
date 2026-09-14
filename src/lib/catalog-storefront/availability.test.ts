import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEW_PRODUCT_AVAILABILITY,
  isProductAvailability,
} from "./availability";

describe("disponibilidad de productos nuevos", () => {
  it("inicia como Disponible", () => {
    expect(DEFAULT_NEW_PRODUCT_AVAILABILITY).toBe("available");
  });

  it.each([
    ["available", true],
    ["out_of_stock", true],
    ["coming_soon", true],
    ["", false],
    ["published", false],
    [null, false],
    [undefined, false],
  ])("valida %j como %s", (value, expected) => {
    expect(isProductAvailability(value)).toBe(expected);
  });
});
