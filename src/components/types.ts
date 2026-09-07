export type ConversationMode = "AI" | "HUMAN";
export type MessageRole = "user" | "assistant" | "human";

export interface ConversationView {
  id: number;
  phone: string;
  name: string | null;
  mode: ConversationMode;
  last_message_at: number | null;
  created_at: number;
  last_message_preview?: string | null;
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
}

export type ConnectionStatus =
  | { status: "loading" }
  | { status: "missing_config"; missing: string[] }
  | { status: "token_expired"; message: string }
  | { status: "error"; message: string }
  | ({ status: "connected" } & ConnectionInfo);
