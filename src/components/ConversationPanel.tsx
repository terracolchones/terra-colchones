"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageBubble } from "@/components/MessageBubble";
import { ModeToggle } from "@/components/ModeToggle";
import type { ConversationMode, ConversationView, MessageView } from "@/components/types";
import { useConversationMessages, type HistoryChange } from "@/components/useConversationMessages";
import { compareMessages, isNearMessageEnd, whatsappContactUrl } from "@/lib/message-history";

interface ConversationPanelProps {
  conversation: ConversationView;
  onConversationChanged: () => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onBack?: () => void;
}

const ORDER_STATUS_LABEL: Record<NonNullable<ConversationView["latest_order"]>["status"], string> = {
  awaiting_chat_confirmation: "Pendiente de confirmación",
  awaiting_location: "Esperando GPS",
  awaiting_payment: "Esperando comprobante",
  payment_proof_received: "Comprobante en revisión",
  payment_confirmed: "Pago confirmado",
};

export function ConversationPanel({ conversation, onConversationChanged, onDelete, onBack }: ConversationPanelProps) {
  const [draft, setDraft] = useState("");
  const [savingMode, setSavingMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingQr, setSendingQr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<{ follow: boolean; anchor: string | null; offset: number; scrollTop: number } | null>(null);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const [unread, setUnread] = useState(0);
  const whatsappUrl = whatsappContactUrl(conversation.phone);

  const beforeMessagesChange = useCallback((current: MessageView[], next: MessageView[], kind: HistoryChange) => {
    const container = scrollRef.current;
    if (!container) return;
    const follow = kind === "initial" || (kind !== "older" && isNearMessageEnd(container));
    const top = container.getBoundingClientRect().top;
    const anchor = [...container.querySelectorAll<HTMLElement>("[data-message-id]")]
      .find((element) => element.getBoundingClientRect().bottom > top);
    pendingScroll.current = { follow, anchor: anchor?.dataset.messageId ?? null,
      offset: anchor ? anchor.getBoundingClientRect().top - top : 0, scrollTop: container.scrollTop };
    if (follow) { setUnread(0); setAwayFromEnd(false); }
    else if (kind === "recent" && current.length) {
      const last = current[current.length - 1];
      const count = next.filter((message) => message.role === "user" && compareMessages(message, last) > 0).length;
      setUnread((value) => value + count);
    }
  }, []);

  const { messages, loaded, loadingOlder, hasOlder, loadError, olderError, refresh: loadMessages, loadOlder } =
    useConversationMessages(conversation.id, beforeMessagesChange);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const pending = pendingScroll.current;
    if (!container || !pending) return;
    pendingScroll.current = null;
    if (pending.follow) container.scrollTop = container.scrollHeight;
    else {
      const anchor = pending.anchor ? container.querySelector<HTMLElement>(`[data-message-id="${pending.anchor}"]`) : null;
      container.scrollTop = anchor ? container.scrollTop + anchor.getBoundingClientRect().top -
        container.getBoundingClientRect().top - pending.offset : pending.scrollTop;
    }
  }, [messages]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    // On mobile the first selected chat loads behind the conversation list.
    // Scroll only on its first visible layout, never on later reading/resizes.
    let hasBeenVisible = container.clientHeight > 0;
    const observer = new ResizeObserver(() => {
      if (container.clientHeight > 0 && !hasBeenVisible) {
        container.scrollTop = container.scrollHeight;
        hasBeenVisible = true;
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function jumpToLatest() {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
    setUnread(0);
    setAwayFromEnd(false);
  }

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
    try { await onDelete(conversation.id); }
    catch { setError("No se pudo borrar la conversación. Inténtalo de nuevo."); }
  }

  return (
    <section className="terra-conversation flex min-h-0 min-w-0 flex-1 flex-col bg-[#f0f2f5]" aria-label="Chat del cliente">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#dce3e2] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          {onBack && <button type="button" onClick={onBack} className="size-11 shrink-0 rounded-lg p-2 text-sm text-emerald-800 md:hidden" aria-label="Volver a conversaciones">←</button>}
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#d9e7e1] text-sm font-semibold text-[#42685b]" aria-hidden="true">{(conversation.name || "C").slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-950 sm:text-base">{conversation.name || conversation.phone}</h2>
          {conversation.name && <p className="mt-0.5 text-xs text-slate-600">{conversation.phone}</p>}
          {conversation.latest_order && (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              Pedido #{conversation.latest_order.public_code} · {ORDER_STATUS_LABEL[conversation.latest_order.status]}
            </p>
          )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50" title="Se abre con la cuenta de WhatsApp activa en este dispositivo"><span className="sr-only sm:not-sr-only">Abrir </span>WhatsApp ↗</a> :
            <span className="text-xs text-slate-500">Número sin formato internacional</span>}
          <ModeToggle mode={conversation.mode} disabled={savingMode} onChange={changeMode} />
          <details className="relative">
          <summary aria-label="Más acciones del chat" className="cursor-pointer list-none rounded-lg px-2 py-2 text-lg text-slate-600 hover:bg-white">⋮</summary>
          <button
            type="button"
            onClick={removeConversation}
            className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white px-3 py-3 text-left text-xs font-semibold text-red-600 shadow-lg hover:bg-red-50"
          >
            Borrar conversación
          </button>
          </details>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {loadError && <div role="status" className="flex shrink-0 items-center justify-between gap-2 bg-amber-50 px-4 py-2 text-xs text-amber-900"><span>{loadError}</span><button type="button" onClick={() => void loadMessages()} className="font-semibold underline">Reintentar</button></div>}
        <div ref={scrollRef} data-testid="message-scroll" aria-label="Historial de mensajes" tabIndex={0}
          onScroll={() => {
            const nearEnd = scrollRef.current ? isNearMessageEnd(scrollRef.current) : true;
            setAwayFromEnd(!nearEnd);
            if (nearEnd) setUnread(0);
          }}
          className="terra-chat-background min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 [overflow-anchor:none] sm:px-7">
          <div className="mx-auto max-w-4xl space-y-3">
          {hasOlder && <div className="text-center"><button type="button" disabled={loadingOlder} onClick={() => void loadOlder()} className="rounded-full border border-[#d2dcd6] bg-white px-4 py-2 text-xs font-medium text-emerald-800 shadow-sm hover:bg-emerald-50 disabled:opacity-60">{loadingOlder ? "Cargando anteriores…" : "Cargar mensajes anteriores"}</button></div>}
          {olderError && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-center text-xs text-amber-900">{olderError}</p>}
          {!loaded && !loadError && <p className="py-8 text-center text-sm text-slate-600">Cargando mensajes…</p>}
          {loaded && !messages.length && <p className="py-8 text-center text-sm text-slate-600">Esta conversación todavía no tiene mensajes.</p>}
          {loaded && messages.length > 0 && !hasOlder && <p className="text-center text-xs text-slate-600">Inicio de la conversación</p>}
          {messages.map((message, index) => {
            const date = new Date(message.created_at * 1000);
            const previous = index ? new Date(messages[index - 1].created_at * 1000) : null;
            return <Fragment key={message.id}>
              {(!previous || date.toDateString() !== previous.toDateString()) && <div className="py-2 text-center"><time dateTime={date.toISOString()} className="rounded-lg bg-white/90 px-3 py-1.5 text-xs text-slate-600 shadow-sm">{date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}</time></div>}
              <MessageBubble message={message} />
            </Fragment>;
          })}
          </div>
        </div>
        {awayFromEnd && <button type="button" onClick={jumpToLatest} className="absolute right-5 bottom-4 rounded-full border border-emerald-200 bg-white px-4 py-2.5 text-xs font-semibold text-emerald-800 shadow-lg hover:bg-emerald-50"><span aria-live="polite">{unread ? `${unread} ${unread === 1 ? "mensaje nuevo" : "mensajes nuevos"}` : "Volver al final"}</span> ↓</button>}
      </div>

      <div className="shrink-0 border-t border-[#dce3e2] p-3 sm:px-5">
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
            aria-label="Escribe un mensaje"
            maxLength={4096}
            placeholder={conversation.mode === "HUMAN" ? "Escribe un mensaje…" : "El modo IA tiene el envío deshabilitado"}
            className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={conversation.mode !== "HUMAN" || sending || !draft.trim()}
            className="self-end rounded-xl bg-[#008069] px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
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
