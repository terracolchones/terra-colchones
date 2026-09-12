"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageBubble } from "@/components/MessageBubble";
import { ModeToggle } from "@/components/ModeToggle";
import type { ConversationMode, ConversationView, MessageView } from "@/components/types";

interface ConversationPanelProps {
  conversation: ConversationView;
  onConversationChanged: () => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

interface MessagesResponse {
  conversation: ConversationView;
  messages: MessageView[];
}

const ORDER_STATUS_LABEL: Record<NonNullable<ConversationView["latest_order"]>["status"], string> = {
  awaiting_chat_confirmation: "Pendiente de confirmación",
  awaiting_location: "Esperando GPS",
  awaiting_payment: "Esperando comprobante",
  payment_proof_received: "Comprobante en revisión",
  payment_confirmed: "Pago confirmado",
};

export function ConversationPanel({ conversation, onConversationChanged, onDelete }: ConversationPanelProps) {
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [draft, setDraft] = useState("");
  const [savingMode, setSavingMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingQr, setSendingQr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const response = await fetch(`/api/messages/${conversation.id}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as MessagesResponse;
    setMessages(data.messages);
  }, [conversation.id]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadMessages(), 0);
    const interval = window.setInterval(() => void loadMessages(), 2000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadMessages]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function changeMode(mode: ConversationMode) {
    if (mode === conversation.mode || savingMode) return;
    setSavingMode(true);
    setError(null);
    try {
      const response = await fetch(`/api/mode/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "No se pudo cambiar el modo");
      await onConversationChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cambiar el modo");
    } finally {
      setSavingMode(false);
    }
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || sending || conversation.mode !== "HUMAN") return;

    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/messages/${conversation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; outside24h?: boolean };
      setDraft("");
      if (!response.ok || !data.ok) {
        setError(data.outside24h ? "Fuera de la ventana de 24h: no se puede enviar texto libre." : data.error || "No se pudo enviar el mensaje");
      }
      await Promise.all([loadMessages(), onConversationChanged()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  }

  async function sendPaymentQr() {
    if (sendingQr || conversation.mode !== "HUMAN") return;
    if (!conversation.latest_order) {
      setError("Primero confirma el producto desde el catálogo para vincular el QR a un pedido.");
      return;
    }

    setSendingQr(true);
    setError(null);
    try {
      const response = await fetch(`/api/payment-qr/${conversation.id}`, {
        method: "POST", headers: { "X-Terra-Order-Code": conversation.latest_order.public_code },
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; outside24h?: boolean };
      if (!response.ok || !data.ok) {
        setError(data.outside24h ? "Fuera de la ventana de 24h: no se puede enviar el QR." : data.error || "No se pudo enviar el QR");
      }
      await Promise.all([loadMessages(), onConversationChanged()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo enviar el QR");
    } finally {
      setSendingQr(false);
    }
  }

  async function removeConversation() {
    if (!window.confirm("¿Borrar esta conversación y todos sus mensajes?")) return;
    await onDelete(conversation.id);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-slate-950">{conversation.name || conversation.phone}</h2>
          {conversation.name && <p className="text-xs text-slate-500">{conversation.phone}</p>}
          {conversation.latest_order && (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              Pedido #{conversation.latest_order.public_code} · {ORDER_STATUS_LABEL[conversation.latest_order.status]}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle mode={conversation.mode} disabled={savingMode} onChange={changeMode} />
          <button
            type="button"
            onClick={removeConversation}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            Borrar
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Cargando mensajes…</p>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
        <div ref={messageEndRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-4">
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {conversation.mode === "AI" && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            La IA responde automáticamente. Cambia a HUMANO para intervenir.
          </p>
        )}
        <div className={conversation.mode === "AI" ? "mt-3 flex gap-2 opacity-50" : "flex gap-2"}>
          <textarea
            value={draft}
            disabled={conversation.mode !== "HUMAN" || sending}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            rows={2}
            maxLength={4096}
            placeholder={conversation.mode === "HUMAN" ? "Escribe un mensaje…" : "El modo IA tiene el envío deshabilitado"}
            className="min-h-11 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={conversation.mode !== "HUMAN" || sending || !draft.trim()}
            className="self-end rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void sendPaymentQr()}
          disabled={conversation.mode !== "HUMAN" || sendingQr}
          className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendingQr ? "Enviando QR…" : "Enviar QR de pago"}
        </button>
      </div>
    </section>
  );
}
