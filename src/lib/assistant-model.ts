import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";

export const DEFAULT_ASSISTANT_MODEL = "gpt-5-mini";

export interface AssistantModelEnvironment { model?: string; baseURL?: string; }
interface AssistantModelInput { instructions: string; history: Array<{ role: string; content: string }>; }
type AssistantModelSettings = Pick<ResponseCreateParamsNonStreaming, "model" | "max_output_tokens" | "reasoning" | "text" | "store">;

/** Pure request configuration shared by the real responder and synthetic evaluations. */
export function getAssistantModelSettings(environment: AssistantModelEnvironment = {}): AssistantModelSettings {
  let model = environment.model?.trim() || DEFAULT_ASSISTANT_MODEL;
  const miniModel = model.replace(/^openai\//, "");
  const isGpt5Mini = /^gpt-5-mini(?:-\d{4}-\d{2}-\d{2})?$/.test(miniModel);
  if (isGpt5Mini) {
    let origin = "https://api.openai.com";
    if (environment.baseURL?.trim()) {
      try { origin = new URL(environment.baseURL.trim()).origin; }
      catch { throw new Error("La URL del proveedor de IA no es válida."); }
    }
    if (origin === "https://openrouter.ai") model = `openai/${miniModel}`;
    else if (origin === "https://api.openai.com") model = miniModel;
  }
  return {
    model,
    // GPT-5 mini shares this budget between reasoning and visible text. A small
    // visible-reply budget alone can produce incomplete or empty Responses.
    max_output_tokens: isGpt5Mini ? 1536 : 220,
    reasoning: { effort: isGpt5Mini ? "minimal" : "none" },
    ...(isGpt5Mini ? { text: { verbosity: "low" as const } } : {}),
    store: false,
  };
}

export function buildAssistantModelRequest(
  input: AssistantModelInput, environment: AssistantModelEnvironment = {},
): ResponseCreateParamsNonStreaming {
  return {
    ...getAssistantModelSettings(environment),
    instructions: input.instructions,
    input: input.history.map((message) => ({
      role: message.role === "user" ? "user" : "assistant", content: message.content,
    })),
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Accept visible text only after the provider has completed the entire response. */
export function readCompletedAssistantText(payload: unknown): string {
  const response = record(payload);
  const invalid = () => new Error("La IA devolvió una respuesta incompleta o no utilizable.");
  if (response?.status !== "completed" || response.error || response.incomplete_details) throw invalid();
  const output = Array.isArray(response.output) ? response.output : [];
  const messages = output.map(record).filter((item) => item?.type === "message");
  if (messages.some((item) => item?.status !== undefined && item.status !== "completed")) throw invalid();
  const text = typeof response.output_text === "string" ? response.output_text
    : messages.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
      .map(record).filter((item) => item?.type === "output_text" && typeof item.text === "string")
      .map((item) => item?.text).join("");
  // Reject oversized output before it can be stored or sent to WhatsApp. Cutting
  // the text here could silently remove an approved map or qualify a fact badly.
  if (!text.trim() || text.length > 4096) throw invalid();
  return text;
}
