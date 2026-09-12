import type { CatalogLeadContext, Message } from "@/lib/db";
import { ADVISOR_CONFIRMATION_REPLY, isHumanHandoffReply } from "@/lib/handoff";
import { requiresHumanHandoffForQuery } from "@/lib/rag/policy";
import type { RagContext } from "@/lib/rag/service";
import { composeInstructions, type ReplyContext } from "./instructions";
import { sanitizeHistory } from "./privacy";
import type { BehaviorVersion } from "./types";

export interface AssistantReply { content: string; needsAdvisorConfirmation: boolean; }
export interface CompletionInput { instructions: string; history: Message[]; }
export interface ResponderDependencies {
  getActiveBehavior: () => BehaviorVersion;
  retrieve: (history: Message[], lead: CatalogLeadContext | null) => Promise<RagContext>;
  complete: (input: CompletionInput) => Promise<string>;
  onRetrievalFailure?: () => void;
}

/** Producción y simulación comparten composición, minimización y política. */
export function createAssistantResponder(deps: ResponderDependencies) {
  return async function generateAssistantReply(
    history: Message[], selectedLead: CatalogLeadContext | null = null, context: ReplyContext = {},
  ): Promise<AssistantReply> {
    // Fija una versión por turno. Un error de configuración no cambia a otro prompt silenciosamente.
    const active = deps.getActiveBehavior();
    const safeHistory = sanitizeHistory(history);
    let rag: RagContext = { context: "", sources: [] };
    try { rag = await deps.retrieve(safeHistory, selectedLead); }
    catch { deps.onRetrievalFailure?.(); }
    const query = [...safeHistory].reverse().find((message) => message.role === "user")?.content;
    if (query && requiresHumanHandoffForQuery(query, rag.sources)) {
      return { content: ADVISOR_CONFIRMATION_REPLY, needsAdvisorConfirmation: true };
    }
    const content = (await deps.complete({
      instructions: composeInstructions(active.instructions, rag.context, context), history: safeHistory,
    })).trim();
    if (!content || /(?:thinking process|reasoning process|<think>|analyze user input|formulate response)/i.test(content)) {
      throw new Error("Respuesta del modelo no utilizable");
    }
    return { content, needsAdvisorConfirmation: isHumanHandoffReply(content) };
  };
}
