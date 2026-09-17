import { randomBytes } from "node:crypto";
import type { CatalogOrder, Message } from "@/lib/db";
import type { MessageAsset, OrderDetails, SendState } from "./contracts";
import { shopifyAdminUrl } from "./contracts";

type Param = string | number | null;
export interface PanelDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...params: Param[]): unknown;
    all(...params: Param[]): unknown[];
    run(...params: Param[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  };
}
export interface AssetRow {
  id: string; message_id: number; conversation_id: number; order_id: string | null;
  kind: MessageAsset["kind"]; filename: string; mime: string; caption: string;
  state: MessageAsset["state"]; provider_id: string | null; latitude: number | null; longitude: number | null;
  send_state?: SendState;
}
export interface SendRow { request_key: string; conversation_id: number; message_id: number; state: SendState; fingerprint: string }
export const panelSchema = `
CREATE TABLE IF NOT EXISTS panel_assets (
 id TEXT PRIMARY KEY, message_id INTEGER NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
 conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 order_id TEXT REFERENCES catalog_orders(id) ON DELETE SET NULL,
 kind TEXT NOT NULL CHECK(kind IN ('image','document','location')), filename TEXT NOT NULL,
 mime TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', state TEXT NOT NULL CHECK(state IN ('pending','ready','failed')),
 provider_id TEXT, latitude REAL, longitude REAL
);
CREATE INDEX IF NOT EXISTS idx_panel_assets_order ON panel_assets(order_id);
CREATE TABLE IF NOT EXISTS panel_order_details (
 order_id TEXT PRIMARY KEY REFERENCES catalog_orders(id) ON DELETE CASCADE,
 full_name TEXT, shop_domain TEXT, shop_resource TEXT
);
CREATE TABLE IF NOT EXISTS panel_sends (
 request_key TEXT PRIMARY KEY, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 message_id INTEGER NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
 fingerprint TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('preparing','sending','sent','uncertain','failed'))
);`;

export function createPanelRepository(db: PanelDatabase) {
  db.exec(panelSchema);
  function asset(id: string) { return db.prepare("SELECT a.*, s.state AS send_state FROM panel_assets a LEFT JOIN panel_sends s ON s.message_id = a.message_id WHERE a.id = ?").get(id) as AssetRow | undefined; }
  function view(row: AssetRow): MessageAsset {
    return { id: row.id, kind: row.kind, filename: row.filename, mime: row.mime, caption: row.caption, state: row.state,
      url: row.kind !== "location" && row.state === "ready" ? `/api/panel/assets/${row.id}` : null,
      latitude: row.latitude, longitude: row.longitude, ...(row.send_state ? { sendState: row.send_state } : {}) };
  }
  function addAsset(input: Omit<AssetRow, "id">) {
    const message=db.prepare("SELECT conversation_id FROM messages WHERE id=?").get(input.message_id) as {conversation_id:number}|undefined;
    if(message?.conversation_id!==input.conversation_id)throw new Error("El archivo no corresponde a la conversación.");
    if(input.order_id){
      const order=db.prepare("SELECT conversation_id FROM catalog_orders WHERE id=?").get(input.order_id) as {conversation_id:number}|undefined;
      if(order?.conversation_id!==input.conversation_id)throw new Error("El pedido no corresponde a la conversación.");
    }
    const id = randomBytes(16).toString("hex");
    db.prepare(`INSERT OR IGNORE INTO panel_assets (id,message_id,conversation_id,order_id,kind,filename,mime,caption,state,provider_id,latitude,longitude)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,input.message_id,input.conversation_id,input.order_id,input.kind,input.filename,input.mime,input.caption,input.state,input.provider_id,input.latitude,input.longitude);
    return db.prepare("SELECT * FROM panel_assets WHERE message_id = ?").get(input.message_id) as AssetRow;
  }
  function incomingMessage(waId: string, phone: string) {
    return db.prepare("SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.wa_message_id=? AND c.phone=? AND m.role='user'").get(waId, phone) as Message | undefined;
  }
  function orderDetails(conversationId: number, publicCode?: string): OrderDetails | null {
    const order = db.prepare(`SELECT * FROM catalog_orders WHERE conversation_id=? ${publicCode ? "AND public_code=?" : ""} ORDER BY created_at DESC, id DESC LIMIT 1`)
      .get(...(publicCode ? [conversationId, publicCode] : [conversationId])) as CatalogOrder | undefined;
    if (!order) return null;
    const details = db.prepare("SELECT * FROM panel_order_details WHERE order_id=?").get(order.id) as { full_name?: string; shop_domain?: string; shop_resource?: string } | undefined;
    const rows = db.prepare("SELECT a.* FROM panel_assets a JOIN messages m ON m.id=a.message_id WHERE a.order_id=? AND a.conversation_id=? AND m.role='user' AND a.kind!='location' ORDER BY a.message_id DESC").all(order.id,conversationId) as AssetRow[];
    const url = details?.shop_domain && details.shop_resource ? shopifyAdminUrl(details.shop_domain, details.shop_resource) : null;
    return { publicCode:order.public_code, productName:order.product_name,variantLabel:order.variant_label,price:order.price,status:order.status,
      customerName:details?.full_name || null,location:order.latitude !== null && order.longitude !== null ? {latitude:order.latitude,longitude:order.longitude,address:order.location_address} : null,
      attachments:rows.map(view),commerce:{provider:url?"shopify":"terra",adminUrl:url} };
  }
  function decorate(messages: Message[]) {
    if (!messages.length) return messages;
    const rows = db.prepare(`SELECT a.*, s.state AS send_state FROM panel_assets a LEFT JOIN panel_sends s ON s.message_id=a.message_id WHERE a.message_id IN (${messages.map(()=>"?").join(",")})`).all(...messages.map(m=>m.id)) as AssetRow[];
    const byMessage = new Map(rows.map(row=>[row.message_id,view(row)]));
    return messages.map(m=>byMessage.has(m.id)?{...m,asset:byMessage.get(m.id)}:m);
  }
  function reserveSend(key: string, conversationId: number, fingerprint: string, content: string): { row: SendRow; created: boolean } {
    db.exec("BEGIN IMMEDIATE");
    try {
      const existing=db.prepare("SELECT * FROM panel_sends WHERE request_key=?").get(key) as SendRow | undefined;
      if(existing){db.exec("COMMIT");return {row:existing,created:false};}
      const mode=db.prepare("SELECT mode FROM conversations WHERE id=?").get(conversationId) as {mode:string}|undefined;
      if(mode?.mode!=="HUMAN")throw new Error("Activa HUMANO antes de enviar archivos.");
      const result=db.prepare("INSERT INTO messages(conversation_id,role,content) VALUES (?,'human',?)").run(conversationId,content);
      const messageId=Number(result.lastInsertRowid);
      db.prepare("INSERT INTO panel_sends(request_key,conversation_id,message_id,fingerprint,state) VALUES (?,?,?,?,'preparing')").run(key,conversationId,messageId,fingerprint);
      db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conversationId);
      db.exec("COMMIT");return {row:{request_key:key,conversation_id:conversationId,message_id:messageId,fingerprint,state:"preparing"},created:true};
    } catch(error){db.exec("ROLLBACK");throw error;}
  }
  function setSendState(key: string, state: SendState, waId?: string) {
    db.exec("BEGIN IMMEDIATE");
    try {
      if(waId)db.prepare("UPDATE messages SET wa_message_id=? WHERE id=(SELECT message_id FROM panel_sends WHERE request_key=?)").run(waId,key);
      db.prepare("UPDATE panel_sends SET state=? WHERE request_key=?").run(state,key);db.exec("COMMIT");
    }catch(error){db.exec("ROLLBACK");throw error;}
  }
  return {asset,view,addAsset,incomingMessage,orderDetails,decorate,reserveSend,setSendState,
    dossier:(code:string)=>{
      const row=db.prepare("SELECT conversation_id FROM catalog_orders WHERE public_code=?").get(code) as {conversation_id:number|null}|undefined;
      return row?.conversation_id?orderDetails(row.conversation_id,code):null;
    },
    setAssetState:(id:string,state:MessageAsset["state"])=>db.prepare("UPDATE panel_assets SET state=? WHERE id=?").run(state,id),
    saveName:(conversationId:number,code:string,name:string)=>db.prepare(`INSERT INTO panel_order_details(order_id,full_name) SELECT id,? FROM catalog_orders WHERE public_code=? AND conversation_id=? ON CONFLICT(order_id) DO UPDATE SET full_name=excluded.full_name`).run(name,code,conversationId),
    linkShopifyOrder:(orderId:string,store:string,resource:string)=>{
      if(!shopifyAdminUrl(store,resource))throw new Error("Referencia Shopify inválida");
      db.prepare("INSERT INTO panel_order_details(order_id,shop_domain,shop_resource) VALUES(?,?,?) ON CONFLICT(order_id) DO UPDATE SET shop_domain=excluded.shop_domain,shop_resource=excluded.shop_resource").run(orderId,store,resource);
    },
  };
}
export type PanelRepository = ReturnType<typeof createPanelRepository>;
