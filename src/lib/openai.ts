import OpenAI from "openai";
import type { Message } from "@/lib/db";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

let client: OpenAI | undefined;

function isLeakedReasoning(content: string): boolean {
  return /(?:here['’]s a thinking process|analyze user input|formulate response|<think>|reasoning process)/i.test(
    content,
  );
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY no está configurada");

  client ??= new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  return client;
}

export async function generateAssistantReply(history: Message[]): Promise<string> {
  // Las respuestas antiguas que expusieron razonamiento se conservan en la
  // auditoría, pero no se reinyectan como contexto para la siguiente respuesta.
  const safeHistory = history.filter(
    (message) => message.role === "user" || !isLeakedReasoning(message.content),
  );

  const response = await getClient().responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    instructions: SYSTEM_PROMPT,
    input: safeHistory.map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
    })),
    max_output_tokens: 220,
    // Desactiva el razonamiento en modelos compatibles. El prompt también
    // prohíbe exponer cualquier razonamiento que un proveedor pudiera devolver.
    reasoning: { effort: "none" },
    store: false,
  });

  const text = response.output_text.trim();
  if (!text) throw new Error("OpenAI no devolvió texto para el mensaje");
  return text;
}
