import { describe, expect, it } from "vitest";
import { appendMissingBranchBlocks, containsInternalPlaceholder, formatAssistantText, hasUnsupportedPublicContact } from "./output-format";

describe("customer-facing plain text", () => {
  it("preserves an approved branch-map pair without duplicating an already complete block", () => {
    const block = "📍 Sucursal Central - Ciudad Prueba\nhttps://bit.ly/synthetic-map\nDirección: Calle Sintética.";
    expect(appendMissingBranchBlocks(`Claro 😊\n\n${block}`, [block])).toBe(`Claro 😊\n\n${block}`);
    expect(appendMissingBranchBlocks("Claro, puedes visitarnos.", [block])).toContain(block);
  });
  it("discards invented or swapped model maps and returns only the published branch pairs", () => {
    const first = "📍 Sucursal Central - Ciudad Aurora\nhttps://maps.example.invalid/aurora";
    const second = "📍 Sucursal Central - Cochabamba\nhttps://maps.example.invalid/cochabamba";
    for (const model of ["📍 Sucursal Central - Cochabamba\nhttps://maps.example.invalid/aurora",
      "📍 Sucursal Central - Cochabamba\n\nhttps://maps.example.invalid/aurora",
      "📍 Sucursal Central - Cochabamba\nhttps://maps.example.invalid/invented"]) {
      const result = appendMissingBranchBlocks(model, [first, second]);
      expect(result).toContain(first);
      expect(result).toContain(second);
      expect(result).not.toContain("invented");
      expect(result).not.toContain("📍 Sucursal Central - Cochabamba\nhttps://maps.example.invalid/aurora");
    }
  });
  it("keeps complete verified links when the model reply exceeds the WhatsApp text budget", () => {
    const block = "📍 Sucursal Central - Ciudad Prueba\nhttps://bit.ly/synthetic-approved-map\nDirección: Avenida Sintética.";
    const result = appendMissingBranchBlocks("Descripción extensa. ".repeat(500), [block]);
    expect(result.length).toBeLessThanOrEqual(4096);
    expect(result).toContain(block);
    expect(result).not.toContain("Descripción extensa");
  });
  it("asks for a city instead of cutting links when the full directory itself exceeds one message", () => {
    const blocks = Array.from({ length: 80 }, (_, index) => `📍 Sucursal ${index} - Ciudad Sintética\nhttps://maps.example.invalid/synthetic-${index}\nDirección: Avenida de Prueba.`);
    const result = appendMissingBranchBlocks("Claro, te comparto las sucursales.", blocks);
    expect(result.length).toBeLessThanOrEqual(4096);
    expect(result).toContain("¿De qué ciudad");
    expect(result).not.toContain("https://");
  });
  it("removes Markdown without changing approved name/phone values", () => {
    expect(formatAssistantText("**Contactos**\n* *Asesora Sintética:* 70000001")).toBe("Contactos\nAsesora Sintética: 70000001");
  });
  it("removes only WhatsApp contact links, preserving maps and user-approved short map links", () => {
    const result = formatAssistantText("Asesor de prueba: 70000001. WhatsApp: https://wa.link/synthetic\n[WhatsApp](https://wa.me/70000001)\n[Ubicación](https://bit.ly/synthetic-map)\nhttps://maps.google.com/?q=synthetic");
    expect(result).toContain("70000001");
    expect(result).toContain("Ubicación: https://bit.ly/synthetic-map");
    expect(result).toContain("https://maps.google.com/?q=synthetic");
    expect(result).not.toContain("WhatsApp");
    expect(result).not.toContain("wa.link");
    expect(result).not.toContain("wa.me");
  });
  it.each(["[enlace omitido]", "[número de contacto omitido]", "[número privado omitido]", "[coordenadas omitidas]", "[pedido]"])("detects internal marker %s", (value) => {
    expect(containsInternalPlaceholder(`Dato: ${value}`)).toBe(true);
  });
  it("does not confuse normal editorial text with a privacy marker", () => {
    expect(containsInternalPlaceholder("El número de contacto de Asesor de Prueba: 70000001")).toBe(false);
  });
  it("removes WhatsApp host variants without a scheme and with www", () => {
    expect(formatAssistantText("wa.me/70000001\nhttps://www.whatsapp.com/send?phone=70000001\nhttps://bit.ly/synthetic-map")).toBe("https://bit.ly/synthetic-map");
  });
  it("rejects invented or swapped named contact numbers in a mixed model response", () => {
    const evidence = "Ciudad de prueba\nAsesor Uno: 70000001\nAsesora Dos: 70000002";
    expect(hasUnsupportedPublicContact("Asesor Uno: 70000001. El colchón cuesta Bs 999.", evidence)).toBe(false);
    expect(hasUnsupportedPublicContact("Asesor Uno: 70000002", evidence)).toBe(true);
    expect(hasUnsupportedPublicContact("Asesor Uno: 79999999", evidence)).toBe(true);
    expect(hasUnsupportedPublicContact("Persona inventada: 70000001", evidence)).toBe(true);
    expect(hasUnsupportedPublicContact("Asesor Uno puede ayudarte. Persona Inventada: 70000001", evidence)).toBe(true);
  });
});
