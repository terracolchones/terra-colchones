import { describe, expect, it } from "vitest";
import { colorVariantHex, isColorVariant } from "./color-variants";

describe("color variants", () => {
  it("recognizes only complete hexadecimal color values", () => {
    expect(colorVariantHex(" #AbC123 ")).toBe("#abc123");
    expect(colorVariantHex("#abc")).toBeNull();
    expect(colorVariantHex("NEGRO")).toBeNull();
  });

  it("keeps commercial options separate from color points", () => {
    expect(isColorVariant({ label: "#1c1917" })).toBe(true);
    expect(isColorVariant({ label: "2 PLAZAS" })).toBe(false);
  });
});
