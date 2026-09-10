import { describe, expect, it } from "vitest";
import { chunkKnowledgeContent } from "./chunking";

describe("bloques de conocimiento", () => {
  it("conserva el contenido corto en un único bloque", () => {
    expect(chunkKnowledgeContent("Entrega", "Terra realiza entregas en Santa Cruz.")).toEqual([
      { title: "Entrega", content: "Terra realiza entregas en Santa Cruz.", metadata: { chunk: 1, chunks: 1 } },
    ]);
  });

  it("divide contenido largo sin exceder el límite de cada bloque", () => {
    const chunks = chunkKnowledgeContent("Ficha", `${"A".repeat(1900)}\n\n${"B".repeat(1900)}`);
    expect(chunks).toHaveLength(4);
    expect(chunks.every((chunk) => chunk.content.length <= 1800)).toBe(true);
  });
});
