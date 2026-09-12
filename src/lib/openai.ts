import OpenAI from "openai";
import { getActiveBehavior } from "@/lib/behavior/store";
import { createAssistantResponder } from "@/lib/behavior/respond";
import { buildRagContext } from "@/lib/rag/service";
import { buildAssistantModelRequest, readCompletedAssistantText } from "@/lib/assistant-model";
export type { AssistantReply } from "@/lib/behavior/respond";

let client: OpenAI | undefined;
function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY no está configurada");
  client ??= new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined, maxRetries: 0 });
  return client;
}

export const generateAssistantReply = createAssistantResponder({
  getActiveBehavior,
  retrieve: buildRagContext,
  onRetrievalFailure: () => console.error("[rag] No se pudo recuperar contexto; se aplica la política sin fuentes."),
  complete: async (input) => {
    const request = buildAssistantModelRequest(input, {
      model: process.env.OPENAI_MODEL, baseURL: process.env.OPENAI_BASE_URL,
    });
    let response;
    try { response = await getClient().responses.create(request); }
    catch { throw new Error("No se pudo completar la respuesta de IA; sin reintentos automáticos."); }
    return readCompletedAssistantText(response);
  },
});
