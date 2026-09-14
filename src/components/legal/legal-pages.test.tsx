import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage, { metadata as privacyMetadata } from "@/app/privacy/page";
import TermsPage, { metadata as termsMetadata } from "@/app/terms/page";
import DataDeletionPage, { metadata as deletionMetadata } from "@/app/data-deletion/page";

describe("páginas informativas públicas", () => {
  it.each([
    [PrivacyPage, privacyMetadata, "/privacy"],
    [TermsPage, termsMetadata, "/terms"],
    [DataDeletionPage, deletionMetadata, "/data-deletion"],
  ] as const)("muestra navegación y dirección oficial sin configuración privada", (Page, metadata, path) => {
    const html = renderToStaticMarkup(createElement(Page));
    expect(metadata.alternates?.canonical).toBe(`https://terracolchonesymuebles.online${path}`);
    expect(html).toContain('aria-label="Información legal"');
    for (const route of ["/privacy", "/terms", "/data-deletion", "/catalogo"]) expect(html).toContain(`href="${route}"`);
    expect(html).not.toContain("trycloudflare.com");
    expect(html).not.toContain('href="https://www.facebook.com/"');
    expect(html).toContain('href="mailto:automatizacionterra@gmail.com"');
    expect(html).toContain(">automatizacionterra@gmail.com</a>");
  });
  it("describe pedidos, ubicación y atención de comprobantes", () => {
    const html = renderToStaticMarkup(createElement(PrivacyPage));
    for (const text of ["pedido", "ubicación", "comprobantes", "OpenRouter"]) expect(html).toContain(text);
  });
  it("no presenta la solicitud como borrado automático ni integral del chat", () => {
    const html = renderToStaticMarkup(createElement(DataDeletionPage));
    expect(html).toContain("no es un botón de borrado automático");
    expect(html).toContain("borrar únicamente el chat");
    expect(html).toContain("no confirma que los datos hayan sido eliminados");
    expect(html).toContain("Solicitud de eliminación de datos");
    expect(html).toContain("Si escribes por correo");
  });
});
