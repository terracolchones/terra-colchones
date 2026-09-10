import { describe, expect, it } from "vitest";
import { normalizeColorHex } from "./color-variants";

describe("color variants", () => {
  it("recognizes only complete hexadecimal color values", () => {
    expect(normalizeColorHex(" #AbC123 ")).toBe("#abc123");
    expect(normalizeColorHex("#abc")).toBeNull();
    expect(normalizeColorHex("NEGRO")).toBeNull();
  });

  it("keeps a missing color optional", () => {
    expect(normalizeColorHex(null)).toBeNull();
    expect(normalizeColorHex(undefined)).toBeNull();
  });
});
