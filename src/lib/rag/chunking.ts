import type { KnowledgeChunkInput } from "./knowledge-types";

const MAX_CHUNK_LENGTH = 1800;

function clean(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

/** Divide fichas largas por párrafos, conservando un contexto claro por bloque. */
export function chunkKnowledgeContent(title: string, content: string): KnowledgeChunkInput[] {
  const normalizedTitle = clean(title);
  const paragraphs = clean(content).split(/\n\s*\n+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= MAX_CHUNK_LENGTH) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= MAX_CHUNK_LENGTH) {
      current = paragraph;
      continue;
    }
    for (let cursor = 0; cursor < paragraph.length; cursor += MAX_CHUNK_LENGTH) {
      chunks.push(paragraph.slice(cursor, cursor + MAX_CHUNK_LENGTH).trim());
    }
    current = "";
  }
  if (current) chunks.push(current);

  return chunks.map((chunk, index) => ({
    title: chunks.length > 1 ? `${normalizedTitle} (${index + 1}/${chunks.length})` : normalizedTitle,
    content: chunk,
    metadata: { chunk: index + 1, chunks: chunks.length },
  }));
}
