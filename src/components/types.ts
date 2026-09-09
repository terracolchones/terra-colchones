export type ConversationMode = "AI" | "HUMAN";
export type MessageRole = "user" | "assistant" | "human";
export type PublicWebhookStatus = "reachable" | "unreachable" | "not_configured";
export type CatalogOrderStatus = "awaiting_chat_confirmation" | "awaiting_location" | "awaiting_payment" | "payment_proof_received" | "payment_confirmed";

export interface CatalogOrderView {
  public_code: string;
  product_name: string;
  variant_label: string | null;
  status: CatalogOrderStatus;
}

export interface ConversationView {
  id: number;
  phone: string;
  name: string | null;
  mode: ConversationMode;
  last_message_at: number | null;
  created_at: number;
  last_message_preview?: string | null;
  latest_order?: CatalogOrderView | null;
}

export interface MessageView {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  wa_message_id: string | null;
  created_at: number;
}

export interface ConnectionInfo {
  phone: string;
  verifiedName: string;
  quality: string;
  webhookStatus: PublicWebhookStatus;
}

export type ConnectionStatus =
  | { status: "loading" }
  | { status: "missing_config"; missing: string[] }
  | { status: "token_expired"; message: string }
  | { status: "error"; message: string }
  | ({ status: "connected" } & ConnectionInfo);
