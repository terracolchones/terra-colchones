"use client";

import type { ConversationMode } from "@/components/types";

interface ModeToggleProps {
  mode: ConversationMode;
  disabled?: boolean;
  onChange: (mode: ConversationMode) => void;
}

export function ModeToggle({ mode, disabled = false, onChange }: ModeToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1" aria-label="Modo de conversación">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("AI")}
        className={`rounded-md px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          mode === "AI" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
        }`}
      >
        IA
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("HUMAN")}
        className={`rounded-md px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          mode === "HUMAN" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
        }`}
      >
        HUMANO
      </button>
    </div>
  );
}
