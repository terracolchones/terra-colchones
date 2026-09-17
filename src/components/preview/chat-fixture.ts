import type { ConversationView, MessageView } from "@/components/types";
import { compareMessages, messageCursor, parseMessageCursor } from "@/lib/message-history";
import type { OrderDetails,MessageAsset } from "@/lib/panel/contracts";

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
    { id: 138, conversation_id: 1, role: "user", content: "Esta es mi ubicación para la entrega.", wa_message_id: null, created_at: now - 240 },
    { id: 139, conversation_id: 1, role: "human", content: "Claro, revisaremos tu pedido y coordinaremos contigo.", wa_message_id: "synthetic-139", created_at: now - 180 },
    { id: 140, conversation_id: 1, role: "user", content: "Te envío mi comprobante para su revisión.", wa_message_id: null, created_at: now - 60 },
    { id: 201, conversation_id: 2, role: "user", content: "Hola, quisiera ver el catálogo de somieres.", wa_message_id: null, created_at: now - 700 },
    { id: 202, conversation_id: 2, role: "assistant", content: "Puedes explorar los modelos desde Ver catálogo.", wa_message_id: "synthetic-202", created_at: now - 600 },
  );

  const proofUrl="data:image/svg+xml;charset=utf-8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="440" height="310" viewBox="0 0 440 310"><rect width="440" height="310" fill="#ffffff"/><text x="220" y="42" fill="#61788c" text-anchor="middle" font-family="Arial" font-size="16">COMPROBANTE DE EJEMPLO</text><text x="220" y="99" fill="#234537" text-anchor="middle" font-family="Arial" font-size="38">Bs 2.490,00</text><text x="35" y="148" fill="#52695f" font-family="Arial" font-size="17">Clara López · Cliente ficticio</text><text x="35" y="182" fill="#52695f" font-family="Arial" font-size="17">Destino: Terra · Muestra</text><path d="M35 211H405" stroke="#dce3e2"/><text x="220" y="253" fill="#8b6b20" text-anchor="middle" font-family="Arial" font-size="16">SIN VALIDEZ · DATOS FICTICIOS</text></svg>');
  const proof:MessageAsset={id:"demo-proof",kind:"image",filename:"comprobante-ejemplo.png",mime:"image/png",caption:"Comprobante ficticio para revisar la interfaz",state:"ready",url:proofUrl,latitude:null,longitude:null};
  // Coordinates are a synthetic test point, never a customer's address.
  messages.find(m=>m.id===138)!.asset={id:"demo-location",kind:"location",filename:"Ubicación de ejemplo",mime:"",caption:"",state:"ready",url:null,latitude:0,longitude:0};
  messages.find(m=>m.id===140)!.asset=proof;
  const orders=new Map<number,OrderDetails>([
    [1,{publicCode:"T-DEMO-0001",productName:"Colchón Terra Comfort · Ejemplo",variantLabel:"Queen · 160 × 200 cm",price:2490,status:"payment_proof_received",customerName:"Clara López · Ejemplo",location:{latitude:0,longitude:0,address:"Ubicación ficticia de prueba"},attachments:[proof],commerce:{provider:"terra",adminUrl:null}}],
    [2,{publicCode:"T-DEMO-0002",productName:"Somier de muestra",variantLabel:null,price:1990,status:"awaiting_location",customerName:null,location:null,attachments:[],commerce:{provider:"terra",adminUrl:null}}],
  ]);
  const objectUrls:string[]=[];
  const sends=new Map<string,number>();

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
    const orderRoute=url.pathname.match(/^\/api\/panel\/orders\/(\d+)$/);
    if(orderRoute){const order=orders.get(Number(orderRoute[1]));if(method==="GET")return Response.json({order:order||null});
      if(method==="PATCH"&&order){const input=JSON.parse(String(init?.body));if(input.publicCode!==order.publicCode)return Response.json({error:"Pedido distinto"},{status:404});order.customerName=String(input.customerName);return Response.json({ok:true});}}
    const uploadRoute=url.pathname.match(/^\/api\/panel\/attachments\/(\d+)$/);
    if(uploadRoute&&method==="POST"){
      const id=Number(uploadRoute[1]);const conversation=conversations.find(c=>c.id===id);
      if(conversation?.mode!=="HUMAN")return Response.json({error:"Activa HUMANO"},{status:409});
      const headers=new Headers(init?.headers),key=headers.get("x-request-id")||"";
      if(sends.has(key))return Response.json({ok:true,state:"sent",messageId:sends.get(key)});
      if(!(init?.body instanceof Blob))return Response.json({error:"Archivo inválido"},{status:400});
      const url=URL.createObjectURL(init.body);objectUrls.push(url);const caption=decodeURIComponent(headers.get("x-file-caption")||"");
      const asset:MessageAsset={id:`demo-${++sequence}`,kind:init.body.type==="application/pdf"?"document":"image",filename:decodeURIComponent(headers.get("x-file-name")||"archivo"),mime:init.body.type,caption,state:"ready",url,latitude:null,longitude:null,sendState:"sent"};
      messages.push({id:sequence,conversation_id:id,role:"human",content:caption||asset.filename,created_at:Math.floor(Date.now()/1000),wa_message_id:`synthetic-${sequence}`,asset});sends.set(key,sequence);return Response.json({ok:true,state:"sent",messageId:sequence});
    }
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
  return { request, append, dispose:()=>objectUrls.forEach(url=>URL.revokeObjectURL(url)), toggleOffline: () => (offline = !offline), delayNext: () => { slowNext = true; }, count: () => polls };
}
