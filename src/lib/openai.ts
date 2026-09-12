import OpenAI from "openai";
import { getActiveBehavior } from "@/lib/behavior/store";
import { createAssistantResponder } from "@/lib/behavior/respond";
import { buildRagContext } from "@/lib/rag/service";
export type { AssistantReply } from "@/lib/behavior/respond";

let client: OpenAI | undefined;
function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY no está configurada");
  client ??= new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined });
  return client;
}

export const generateAssistantReply = createAssistantResponder({
  getActiveBehavior,
  retrieve: buildRagContext,
  onRetrievalFailure: () => console.error("[rag] No se pudo recuperar contexto; se aplica la política sin fuentes."),
  complete: async ({ instructions, history }) => {
    const response = await getClient().responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      instructions,
      input: history.map((message) => ({
        role: message.role === "user" ? "user" : "assistant", content: message.content,
      })),
      max_output_tokens: 220,
      reasoning: { effort: "none" },
      store: false,
    });
    return response.output_text;
  },
});
