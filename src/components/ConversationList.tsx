"use client";

import type { ConversationView } from "@/components/types";

interface ConversationListProps {
  conversations: ConversationView[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

function relativeTime(seconds: number | null): string {
  if (!seconds) return "sin mensajes";
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (elapsed < 60) return "ahora";
  if (elapsed < 3600) return `hace ${Math.floor(elapsed / 60)} min`;
  if (elapsed < 86400) return `hace ${Math.floor(elapsed / 3600)} h`;
  return `hace ${Math.floor(elapsed / 86400)} d`;
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  if (conversations.length === 0) {
    return <div className="p-7 text-center text-sm text-slate-500">Todavía no hay conversaciones.</div>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {conversations.map((conversation) => {
        const selected = conversation.id === selectedId;
        return (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelect(conversation.id)}
            className={`w-full px-4 py-4 text-left transition ${
              selected ? "bg-emerald-50" : "bg-white hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-semibold text-slate-900">
                {conversation.name || conversation.phone}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  conversation.mode === "AI"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {conversation.mode === "AI" ? "IA" : "HUMANO"}
              </span>
            </div>
            {conversation.name && <p className="mt-0.5 text-xs text-slate-500">{conversation.phone}</p>}
            <p className="mt-2 truncate text-xs text-slate-600">
              {conversation.last_message_preview || "Sin mensajes"}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">{relativeTime(conversation.last_message_at)}</p>
          </button>
        );
      })}
    </div>
  );
}
