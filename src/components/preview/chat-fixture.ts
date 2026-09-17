import type { ConversationView, MessageView } from "@/components/types";
import { compareMessages, messageCursor, parseMessageCursor } from "@/lib/message-history";

/** Synthetic, in-memory browser fixture. Never reads a service or database. */
export function createChatFixture() {
  const now = Math.floor(Date.now() / 1000);
  let sequence = 1000;
  let activeId = 1;
  let offline = false;
  let slowNext = false;
  let polls = 0;
  const conversations: ConversationView[] = [
    { id: 1, name: "Clara · ejemplo", phone: "12025550100", mode: "HUMAN", created_at: now - 200000, last_message_at: now - 60, latest_order: { public_code: "T-DEMO-0001", product_name: "Colchón de muestra", variant_label: "Dos plazas", status: "payment_proof_received" } },
    { id: 2, name: "Mateo · ejemplo", phone: "12025550101", mode: "AI", created_at: now - 180000, last_message_at: now - 600, latest_order: { public_code: "T-DEMO-0002", product_name: "Somier de muestra", variant_label: null, status: "awaiting_location" } },
    { id: 3, name: "Nueva conversación · ejemplo", phone: "12025550102", mode: "AI", created_at: now, last_message_at: now, latest_order: null },
  ];
  const subjects = [
    "Quisiera conocer los modelos disponibles.",
    "Puedes revisar los modelos y medidas en nuestro catálogo.",
    "Estoy buscando una opción de dos plazas.",
    "En cada ficha puedes seleccionar la variante antes de confirmar.",
    "Gracias, voy a revisar las opciones con mi familia.",
    "Cuando hayas elegido, puedes confirmar desde el catálogo.",
  ];
  const messages: MessageView[] = Array.from({ length: 137 }, (_, i) => ({
    id: i + 1, conversation_id: 1, role: i % 2 === 0 ? "user" : "assistant", content: `Ejemplo ${i + 1}. ${subjects[i % subjects.length]}`,
    wa_message_id: i % 2 ? `synthetic-${i}` : null, created_at: now - 190000 + Math.floor(i / 3) * 3600,
  }));
  messages.push(
    { id: 138, conversation_id: 1, role: "user", content: "Ya confirmé el producto. ¿Podemos coordinar la entrega con un asesor?", wa_message_id: null, created_at: now - 240 },
    { id: 139, conversation_id: 1, role: "human", content: "Claro, revisaremos tu pedido y coordinaremos contigo.", wa_message_id: "synthetic-139", created_at: now - 180 },
    { id: 140, conversation_id: 1, role: "user", content: "Perfecto, muchas gracias. Quedo atenta.", wa_message_id: null, created_at: now - 60 },
    { id: 201, conversation_id: 2, role: "user", content: "Hola, quisiera ver el catálogo de somieres.", wa_message_id: null, created_at: now - 700 },
    { id: 202, conversation_id: 2, role: "assistant", content: "Puedes explorar los modelos desde Ver catálogo.", wa_message_id: "synthetic-202", created_at: now - 600 },
  );

  function append(count = 1) {
    const timestamp = Math.floor(Date.now() / 1000);
    for (let i = 0; i < count; i++) messages.push({ id: ++sequence, conversation_id: activeId, role: "user", content: `Mensaje de prueba ${sequence}: estoy consultando mi pedido.`, created_at: timestamp, wa_message_id: null });
  }

  async function request(url: URL, init?: RequestInit): Promise<Response> {
    const delay = slowNext ? 1500 : 100;
    slowNext = false;
    await new Promise((resolve) => window.setTimeout(resolve, delay));
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const method = init?.method ?? "GET";
    if (offline && method === "GET") return Response.json({ error: "Fallo simulado" }, { status: 503 });
    if (url.pathname === "/api/conversations") return Response.json({ conversations: conversations.map((conversation) => {
      const last = messages.filter((m) => m.conversation_id === conversation.id).sort(compareMessages).at(-1);
      return { ...conversation, last_message_preview: last?.content ?? null, last_message_at: last?.created_at ?? null };
    }) });
    const match = url.pathname.match(/^\/api\/(messages|mode|payment-qr|conversations)\/(\d+)$/);
    if (!match) return Response.json({ error: "Acción fuera de la vista local" }, { status: 403 });
    const id = Number(match[2]);
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) return Response.json({ error: "Ejemplo no encontrado" }, { status: 404 });
    if (match[1] === "messages" && method === "GET") {
      activeId = id;
      polls++;
      const before = parseMessageCursor(url.searchParams.get("before") ?? "");
      const after = parseMessageCursor(url.searchParams.get("after") ?? "");
      let rows = messages.filter((message) => message.conversation_id === id).sort(compareMessages);
      if (before) rows = rows.filter((m) => compareMessages(m, { created_at: before.createdAt, id: before.id }) < 0);
      if (after) rows = rows.filter((m) => compareMessages(m, { created_at: after.createdAt, id: after.id }) > 0);
      const hasMore = rows.length > 50;
      rows = after ? rows.slice(0, 50) : rows.slice(-50);
      return Response.json({ conversation, messages: rows, hasMore, nextCursor: hasMore ? messageCursor(after ? rows[rows.length - 1] : rows[0]) : null });
    }
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (match[1] === "mode" && method === "POST") { conversation.mode = body.mode; return Response.json({ ok: true }); }
    if (match[1] === "messages" && method === "POST") {
      if (conversation.mode !== "HUMAN") return Response.json({ error: "Activa HUMANO" }, { status: 409 });
      messages.push({ id: ++sequence, conversation_id: id, role: "human", content: String(body.content), created_at: Math.floor(Date.now() / 1000), wa_message_id: `synthetic-${sequence}` });
      return Response.json({ ok: true });
    }
    if (match[1] === "payment-qr") return Response.json({ error: "Vista local: no se envía ningún QR." }, { status: 409 });
    if (match[1] === "conversations" && method === "DELETE") return Response.json({ error: "La eliminación está deshabilitada en la demostración." }, { status: 409 });
    return Response.json({ error: "Acción no disponible en la demostración" }, { status: 403 });
  }
  return { request, append, toggleOffline: () => (offline = !offline), delayNext: () => { slowNext = true; }, count: () => polls };
}
