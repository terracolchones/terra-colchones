import { describe, expect, it } from "vitest";
import type { Message } from "@/lib/db";
import { sanitizeHistory } from "@/lib/behavior/privacy";
import { buildPublicDirectoryReply, parsePublishedDirectory, shouldRetrievePublicDirectory } from "./public-contacts";
import type { KnowledgeChunk } from "./core";

const message = (content: string, role: Message["role"] = "user"): Message => ({ id: 1, conversation_id: 1, role, content, wa_message_id: null, created_at: 0 });
const approved = `Ciudad Aurora

Horario de atención - Ciudad Aurora
- Lunes a sábado: de 09:00 a 18:00.

Sucursal Central - Ciudad Aurora
- Dirección: Avenida de Prueba #10.
- Ubicación: https://bit.ly/synthetic-approved-map

Pedidos e información - Ciudad Aurora
- Asesor Uno: 70000001
- Asesora Dos: 70000002

Cochabamba

Sucursal Central - Cochabamba
- Dirección: Calle Sintética #20.
- Ubicación: https://maps.google.com/?q=synthetic-place

Pedidos e información - Cochabamba
- Asesor Tres: 70000003
- Asesora Cuatro: 70000004

Puerto Claro

Sucursal Central - Puerto Claro
- Dirección: Avenida Ficticia.

Pedidos e información - Puerto Claro
- Teléfono: 70000005
- Teléfono: 70000006

Formas de pago
Se acepta efectivo o QR.`;
const chunks: KnowledgeChunk[] = [{ id: "published-synthetic-version-0", title: "Documento publicado", content: approved }];
const reply = (...history: Message[]) => buildPublicDirectoryReply(sanitizeHistory(history), chunks)?.content;

describe("published contact ownership and city context", () => {
  it("preserves published names and phone text, with no WhatsApp links or Markdown", () => {
    const result = reply(message("Dame los número de Cochabamba"));
    expect(result).toBe("Cochabamba\nAsesor Tres: 70000003\nAsesora Cuatro: 70000004");
  });
  it("recognizes a unique adjacent city-name typo without changing the official spelling", () => {
    expect(reply(message("Dame los números de Cochabamab"))).toContain("Cochabamba\nAsesor Tres: 70000003");
    expect(reply(message("Dame los números de Cochabamna"))).toContain("Cochabamba\nAsesor Tres: 70000003");
  });
  it("combines only the requested city's offices and numbers, preserving an approved short map URL", () => {
    const result = reply(message("Quiero los datos de Ciudad Aurora tanto oficina y números"));
    expect(result).toContain("Dirección: Avenida de Prueba #10.");
    expect(result).toContain("https://bit.ly/synthetic-approved-map");
    expect(result).toContain("Asesor Uno: 70000001");
    expect(result).not.toContain("70000003");
    expect(result).not.toContain("09:00");
  });
  it("re-reads approved numbers after a city followup instead of replaying a sanitized/stale assistant phone", () => {
    const result = reply(message("Puerto Claro"), message("Puerto Claro. Teléfono: 79999999", "assistant"), message("Número de contacto?"));
    expect(result).toContain("Teléfono: 70000005\nTeléfono: 70000006");
    expect(result).not.toContain("79999999");
    expect(result).not.toContain("omitido");
  });
  it("asks which city when contact context is absent or ambiguous", () => {
    expect(reply(message("Dame los teléfonos"))).toContain("¿De qué ciudad");
    expect(reply(message("Ciudad Aurora y Cochabamba"), message("Dame los teléfonos"))).toContain("¿De qué ciudad");
  });
  it("does not reuse an old city when a new unknown city/person is explicitly requested", () => {
    for (const query of ["Dame los números de Ciudad Desconocida", "Dame el teléfono de Persona Inexistente", "Dame el teléfono de Persona Inexistente en Cochabamba"]) {
      const result = reply(message("Cochabamba"), message(query));
      expect(result).toContain("No encuentro ese contacto");
      expect(result).not.toContain("70000003");
    }
  });
  it("selects a named advisor only, and supports the named followup after contact details", () => {
    const result = reply(message("Dame los teléfonos de Cochabamba"), message("¿Y Asesora Cuatro?"));
    expect(result).toBe("Cochabamba\nAsesora Cuatro: 70000004");
    expect(reply(message("Dame el número de Asesor Tres"))).toBe("Cochabamba\nAsesor Tres: 70000003");
  });
  it("supports a city answer to the preceding directory question, without intercepting thanks", () => {
    expect(reply(message("Dame los números"), message("¿De qué ciudad necesitas los números de contacto?", "assistant"), message("Cochabamba"))).toContain("70000003");
    expect(reply(message("Dame los números de Cochabamba"), message("Gracias"))).toBeUndefined();
    expect(reply(message("Dame los números de Cochabamba"), message("¿Entregan en Cochabamba?"))).toBeUndefined();
    expect(reply(message("Dame los números de Cochabamba"), message("¿Y colchones cómodos?"))).toBeUndefined();
    expect(reply(message("Dame los números de Cochabamba"), message("¿Y Persona Inexistente?"))).toContain("No encuentro ese contacto");
    expect(reply(message("Dame los números"), message("Cochabamna"))).toContain("Cochabamba\nAsesor Tres: 70000003");
  });
  it("resolves an explicit place/person pronoun only using the published context", () => {
    expect(reply(message("Dame los teléfonos de Cochabamba"), message("Dame el teléfono de allí"))).toContain("70000003");
    expect(reply(message("Dame el teléfono de Asesora Cuatro"), message("¿Y el número de ella?"))).toBe("Cochabamba\nAsesora Cuatro: 70000004");
    expect(reply(message("Cochabamba"), message("Dame el número de un asesor"))).toContain("70000003");
  });
  it("does not treat financial or order fields inside a public section as contact numbers", () => {
    const suspicious = [{ id: "published-synthetic-0", title: "", content: "Pedidos e información - Ciudad Prueba\n- Cuenta bancaria: 70000009\n- Código pedido: 70000008\n- Asesor Uno: 70000001" }];
    expect(parsePublishedDirectory(suspicious)[0].contacts).toEqual([{ name: "Asesor Uno", phone: "70000001" }]);
  });
  it("rejects an ambiguous number cut by an old chunk boundary instead of emitting seven digits", () => {
    const cut = [{ id: "published-synthetic-0", title: "", content: "Pedidos e información - Ciudad Prueba\n- Asesor Uno: 7000000" },
      { id: "published-synthetic-1", title: "", content: "1\n" }];
    expect(parsePublishedDirectory(cut)[0].contacts).toEqual([]);
  });
  it("fails closed on an explicit named followup when the published source cannot be retrieved", () => {
    const result = buildPublicDirectoryReply([message("Dame los números de Cochabamba"), message("¿Y el de Asesor Tres?")], []);
    expect(result?.content).toContain("No tengo un contacto publicado");
    expect(buildPublicDirectoryReply([message("Dame los números"), message("¿De qué ciudad?", "assistant"), message("Cochabamba")], [])?.content).toContain("No tengo un contacto publicado");
  });
  it("never transfers one city's hours to another city", () => {
    const result = reply(message("Ciudad Aurora"), message("Lunes a sábado: de 09:00 a 18:00", "assistant"), message("Puerto Claro"), message("Horarios de atención?"));
    expect(result).toBe("Puerto Claro\nNo tengo un horario publicado para esta sucursal.");
    expect(reply(message("¿Cuál es el horario de Ciudad Aurora?"))).toContain("09:00 a 18:00");
  });
  it("reassembles city/contact boundaries only within the same published version", () => {
    const split = [
      { id: "published-synthetic-one-1", title: "Draft title must not be authority", content: "- Asesor Uno: 70000001" },
      { id: "published-synthetic-one-0", title: "Documento publicado", content: "Pedidos e información - Ciudad Aurora" },
      { id: "published-synthetic-two-0", title: "Ciudad Aurora", content: "- Persona Ajena: 70000009" },
      { id: "knowledge-old-index", title: "Ciudad Aurora", content: "Pedidos e información - Ciudad Aurora\n- Persona Antigua: 70000008" },
    ];
    const result = buildPublicDirectoryReply([message("Dame los teléfonos de Ciudad Aurora")], split)?.content;
    expect(result).toBe("Ciudad Aurora\nAsesor Uno: 70000001");
    expect(parsePublishedDirectory(split)[0].contacts).toHaveLength(1);
  });
  it("clarifies duplicate names across cities and does not guess among conflicting numbers", () => {
    const duplicate = [...chunks, { id: "published-synthetic-other-0", title: "Documento publicado", content: "Pedidos e información - Ciudad Prueba\n- Asesor Tres: 70000007" }];
    expect(buildPublicDirectoryReply([message("Dame el teléfono de Asesor Tres")], duplicate)?.content).toContain("más de una ciudad");
    const conflict = [...chunks, { id: "published-synthetic-conflict-0", title: "Documento publicado", content: "Pedidos e información - Cochabamba\n- Asesor Tres: 70000007" }];
    const result = buildPublicDirectoryReply([message("Dame los números de Cochabamba")], conflict)?.content;
    expect(result).toContain("necesito confirmarlos");
    expect(result).not.toContain("70000003");
    expect(result).not.toContain("70000007");
  });
  it("never invents a contact when approved data is unavailable", () => {
    const result = buildPublicDirectoryReply([message("Dame los números de Cochabamba")], [])?.content;
    expect(result).toContain("No tengo un contacto publicado");
    expect(result).not.toMatch(/\d{7,}/);
  });
  it("does not classify private account/customer values as public contact queries", () => {
    for (const query of ["Mi número es 79999999", "Mi número de tarjeta", "Dame el número de mi pedido"]) {
      expect(shouldRetrievePublicDirectory([message(query)])).toBe(false);
    }
  });
});
