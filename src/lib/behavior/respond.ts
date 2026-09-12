import type { CatalogLeadContext, Message } from "@/lib/db";
import { ADVISOR_CONFIRMATION_REPLY, isHumanHandoffReply } from "@/lib/handoff";
import { requiresHumanHandoffForQuery } from "@/lib/rag/policy";
import type { RagContext } from "@/lib/rag/service";
import { composeInstructions, type ReplyContext } from "./instructions";
import { sanitizeHistory } from "./privacy";
import { appendMissingBranchBlocks, containsInternalPlaceholder, formatAssistantText, hasUnsupportedPublicContact } from "./output-format";
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
    const advisorFallback = (): AssistantReply => ({
      content: appendMissingBranchBlocks(ADVISOR_CONFIRMATION_REPLY, rag.requiredBranchBlocks),
      // The factual map block should survive the handler's generic-advisor substitution.
      // This flag controls copy only; explicit HUMAN routing still belongs to the handler.
      needsAdvisorConfirmation: !rag.requiredBranchBlocks?.length,
    });
    if (rag.directoryReply) {
      const content = formatAssistantText(rag.directoryReply);
      if (!content || containsInternalPlaceholder(content)) return { content: ADVISOR_CONFIRMATION_REPLY, needsAdvisorConfirmation: true };
      return { content, needsAdvisorConfirmation: false };
    }
    const query = [...safeHistory].reverse().find((message) => message.role === "user")?.content;
    if (query && requiresHumanHandoffForQuery(query, rag.sources)) {
      return advisorFallback();
    }
    const rawContent = (await deps.complete({
      instructions: composeInstructions(active.instructions, rag.context, context), history: safeHistory,
    })).trim();
    if (!rawContent || /(?:thinking process|reasoning process|<think>|analyze user input|formulate response)/i.test(rawContent)) {
      throw new Error("Respuesta del modelo no utilizable");
    }
    const content = formatAssistantText(rawContent);
    if (!content || containsInternalPlaceholder(content)) return advisorFallback();
    if (rag.contactEvidence !== undefined && hasUnsupportedPublicContact(content, rag.contactEvidence)) {
      return advisorFallback();
    }
    if (rag.requiredBranchBlocks?.length && isHumanHandoffReply(content)) return advisorFallback();
    return { content: appendMissingBranchBlocks(content, rag.requiredBranchBlocks), needsAdvisorConfirmation: isHumanHandoffReply(content) };
  };
}
