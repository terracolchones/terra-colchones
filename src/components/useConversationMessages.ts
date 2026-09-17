"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageView } from "@/components/types";
import { mergeMessages, messageCursor, type MessagePage } from "@/lib/message-history";

export type HistoryChange = "initial" | "recent" | "older";
type BeforeChange = (current: MessageView[], next: MessageView[], kind: HistoryChange) => void;

export function useConversationMessages(conversationId: number, beforeChange: BeforeChange) {
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [olderError, setOlderError] = useState<string | null>(null);
  const current = useRef<MessageView[]>([]);
  const initialized = useRef(false);
  const olderCursor = useRef<string | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const running = useRef<Promise<void> | null>(null);

  const load = useCallback(async (kind: "recent" | "older") => {
    // Serialize history, refresh and manual-send refreshes. Polling never races a prepend.
    while (running.current) await running.current;
    const controller = lifecycle.current;
    if (!controller || controller.signal.aborted || (kind === "older" && !olderCursor.current)) return;
    const operation = (async () => {
      if (kind === "older") setLoadingOlder(true);
      try {
        const initial = !initialized.current;
        const existing = current.current;
        // Re-read the last 50 rows as well as new ones, so changed send metadata stays fresh.
        let cursor = kind === "older" ? olderCursor.current :
          existing.length > 50 ? messageCursor(existing[existing.length - 51]) : null;
        let direction: "before" | "after" = kind === "older" ? "before" : "after";
        // Include the oldest loaded row, not the whole conversation, when fewer than 51 are loaded.
        if (kind === "recent" && !initial && existing.length > 0 && !cursor) {
          cursor = messageCursor({ created_at: existing[0].created_at, id: existing[0].id - 1 });
        }
        if (initial) { cursor = null; direction = "before"; }
        let next = existing;
        let firstPage: MessagePage | null = null;
        do {
          const query = cursor ? `?${direction}=${encodeURIComponent(cursor)}` : "";
          const response = await fetch(`/api/messages/${conversationId}${query}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("No se pudieron actualizar los mensajes.");
          const page = await response.json() as MessagePage;
          if (controller.signal.aborted || lifecycle.current !== controller) return;
          firstPage ??= page;
          next = mergeMessages(next, page.messages);
          const previousCursor = cursor;
          cursor = direction === "after" && page.hasMore ? page.nextCursor : null;
          if (cursor && cursor === previousCursor) throw new Error("No se pudo avanzar en el historial.");
        } while (cursor);
        if (!firstPage) return;
        if (initial || kind === "older") {
          olderCursor.current = firstPage.nextCursor;
          setHasOlder(firstPage.hasMore);
        }
        if (next !== current.current || initial) {
          beforeChange(current.current, next, initial ? "initial" : kind);
          current.current = next;
          setMessages(next);
        }
        initialized.current = true;
        setLoaded(true);
        if (kind === "older") setOlderError(null);
        else setLoadError(null);
      } catch {
        if (!controller.signal.aborted && lifecycle.current === controller) {
          if (kind === "older") setOlderError("No se pudo cargar el historial. Inténtalo de nuevo.");
          else setLoadError("No se pudieron actualizar los mensajes. Reintentando…");
        }
      } finally {
        if (!controller.signal.aborted && lifecycle.current === controller && kind === "older") setLoadingOlder(false);
      }
    })();
    running.current = operation;
    try { await operation; } finally { if (running.current === operation) running.current = null; }
  }, [conversationId, beforeChange]);

  const refresh = useCallback(() => load("recent"), [load]);
  const loadOlder = useCallback(() => load("older"), [load]);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    let timer: number;
    async function poll() {
      await refresh();
      if (!controller.signal.aborted) timer = window.setTimeout(() => void poll(), 2000);
    }
    timer = window.setTimeout(() => void poll(), 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [refresh]);

  return { messages, loaded, loadingOlder, hasOlder, loadError, olderError, refresh, loadOlder };
}
