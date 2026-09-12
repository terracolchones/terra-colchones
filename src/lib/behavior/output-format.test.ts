import { describe, expect, it } from "vitest";
import { containsInternalPlaceholder, formatAssistantText, hasUnsupportedPublicContact } from "./output-format";

describe("customer-facing plain text", () => {
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
