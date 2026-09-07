"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConversationList } from "@/components/ConversationList";
import { ConversationPanel } from "@/components/ConversationPanel";
import { DashboardHeader } from "@/components/DashboardHeader";
import type { ConnectionInfo, ConversationView } from "@/components/types";

interface DashboardProps {
  info: ConnectionInfo;
  onTestConnection: () => Promise<void>;
}

export function Dashboard({ info, onTestConnection }: DashboardProps) {
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudieron cargar las conversaciones");
      const data = (await response.json()) as { conversations: ConversationView[] };
      setConversations(data.conversations);
      setListError(null);
      setSelectedId((current) => {
        if (current && data.conversations.some((conversation) => conversation.id === current)) return current;
        return data.conversations[0]?.id ?? null;
      });
    } catch (reason) {
      setListError(reason instanceof Error ? reason.message : "No se pudieron cargar las conversaciones");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadConversations(), 0);
    const interval = window.setInterval(() => void loadConversations(), 2000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadConversations]);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) || null,
    [conversations, selectedId],
  );

  const deleteConversation = useCallback(
    async (id: number) => {
      const response = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo borrar la conversación");
      await loadConversations();
    },
    [loadConversations],
  );

  return (
    <main className="flex h-screen min-h-[560px] flex-col bg-slate-100">
      <DashboardHeader info={info} onTestConnection={onTestConnection} />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-full max-w-sm shrink-0 flex-col border-r border-slate-200 bg-white md:w-80">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-800">Conversaciones</h2>
            {listError && <p className="mt-1 text-xs text-red-600">{listError}</p>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ConversationList conversations={conversations} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </aside>
        {selectedConversation ? (
          <ConversationPanel
            key={selectedConversation.id}
            conversation={selectedConversation}
            onConversationChanged={loadConversations}
            onDelete={deleteConversation}
          />
        ) : (
          <section className="hidden flex-1 place-items-center bg-slate-50 p-8 text-center md:grid">
            <div>
              <p className="text-lg font-semibold text-slate-700">Selecciona una conversación</p>
              <p className="mt-1 text-sm text-slate-500">Los mensajes recibidos aparecerán aquí automáticamente.</p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
