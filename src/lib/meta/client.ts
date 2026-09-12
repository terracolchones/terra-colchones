import { randomBytes } from "node:crypto";
import { diagnostic, messageRef, type MessageKind } from "./diagnostics";

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number };
  messages?: Array<{ id?: string }>;
}

interface GraphMessageResponse {
  messages?: Array<{ id?: string }>;
}

type GraphMessagePayload = Record<string, unknown>;

export class MetaGraphError extends Error {
  readonly expiredAccessToken: boolean;
  readonly status: number;
  readonly code?: number;
  readonly subcode?: number;

  constructor(
    message: string,
    status: number,
    code?: number,
    subcode?: number,
  ) {
    // Provider text can include private values. Keep only its existing expiry
    // classification; do not retain the original text in message/cause/fields.
    const safeStatus = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
    const safeCode = graphCode(code);
    super(`Graph API ${safeStatus || "estado desconocido"}${safeCode !== undefined ? ` (#${safeCode})` : ""}: la solicitud no se completó`);
    this.name = "MetaGraphError";
    this.status = safeStatus;
    this.code = safeCode;
    this.subcode = graphCode(subcode);
    // Keep numeric codes in the safe message for legacy outside24h consumers.
    this.expiredAccessToken = typeof message === "string" && /(?:access token|session).*(?:has )?expired/i.test(message);
  }
}

function graphCode(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function graphBaseUrl(): string {
  return `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v25.0"}`;
}

function getMetaCredentials(): { phoneId: string; token: string } {
  const phoneId = process.env.META_PHONE_NUMBER_ID;
  const token = process.env.META_ACCESS_TOKEN;
  if (!phoneId || !token) {
    throw new Error("META_PHONE_NUMBER_ID o META_ACCESS_TOKEN no están configurados");
  }
  return { phoneId, token };
}

async function graphError(response: Response): Promise<Error> {
  const text = await response.text();
  let detail = text;
  let code: number | undefined;
  let subcode: number | undefined;
  try {
    const parsed = JSON.parse(text) as GraphErrorBody;
    detail = typeof parsed.error?.message === "string" ? parsed.error.message : text;
    const numericCode = parsed.error?.code;
    const numericSubcode = parsed.error?.error_subcode;
    code = graphCode(numericCode);
    subcode = graphCode(numericSubcode);
  } catch {
    // Meta no siempre devuelve JSON ante errores de infraestructura.
  }
  return new MetaGraphError(`Graph API ${response.status}: ${detail}`, response.status, code, subcode);
}

/** Distingue un token vencido de otros fallos de configuración o de Graph. */
export function isExpiredMetaAccessToken(error: unknown): boolean {
  if (!(error instanceof MetaGraphError)) return false;
  return error.expiredAccessToken;
}

export async function sendTextMessage(phone: string, body: string): Promise<{ wa_message_id: string }> {
  if (!body.trim()) throw new Error("No se puede enviar un mensaje vacío");
  if (body.length > 4096) throw new Error("WhatsApp permite un máximo de 4096 caracteres por texto");

  return sendGraphMessage(phone, {
    type: "text",
    text: { preview_url: false, body },
  });
}

async function sendGraphMessage(phone: string, message: GraphMessagePayload): Promise<{ wa_message_id: string }> {
  const kind: MessageKind = message.type === "text" ? "text" : message.type === "image" ? "image"
    : message.type === "interactive" && typeof message.interactive === "object" && message.interactive !== null
      ? (message.interactive as { type?: unknown }).type === "cta_url" ? "cta_url"
        : (message.interactive as { type?: unknown }).type === "location_request_message" ? "location_request_message" : "interactive"
      : "unknown";
  const attempt_ref = randomBytes(16).toString("hex");
  const startedAt = Date.now();
  let credentials: ReturnType<typeof getMetaCredentials>;
  try {
    credentials = getMetaCredentials();
  } catch (error) {
    diagnostic({ event: "send.not_attempted", attempt_ref, kind });
    throw error;
  }
  const { phoneId, token } = credentials;
  diagnostic({ event: "send.attempt", attempt_ref, kind });
  let response: Response;
  try {
    response = await fetch(`${graphBaseUrl()}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        ...message,
      }),
    });
  } catch {
    diagnostic({ event: "send.uncertain", attempt_ref, kind, elapsed_ms: Math.max(0, Date.now() - startedAt) });
    // A transport failure does not prove that the provider did not accept it.
    throw new Error("No se pudo confirmar el resultado del envío a Meta");
  }

  if (!response.ok) {
    let error: Error;
    try {
      error = await graphError(response);
    } catch {
      error = new MetaGraphError("Respuesta no interpretable", response.status);
    }
    const graph = error instanceof MetaGraphError ? error : undefined;
    // "Rejected" describes this explicit Graph response, not a permanent error
    // or permission to retry. Infrastructure/unreadable responses are uncertain.
    diagnostic({
      event: response.status >= 400 && response.status < 500 && graph?.code !== undefined ? "send.rejected" : "send.uncertain",
      attempt_ref, kind, http_status: response.status, code: graph?.code, subcode: graph?.subcode,
      elapsed_ms: Math.max(0, Date.now() - startedAt),
    });
    throw error;
  }
  let json: GraphMessageResponse;
  try {
    json = (await response.json()) as GraphMessageResponse;
  } catch {
    diagnostic({ event: "send.uncertain", attempt_ref, kind, http_status: response.status, elapsed_ms: Math.max(0, Date.now() - startedAt) });
    throw new Error("No se pudo confirmar el resultado del envío a Meta");
  }
  const id = json?.messages?.[0]?.id;
  if (typeof id !== "string" || !id.trim()) {
    diagnostic({ event: "send.uncertain", attempt_ref, kind, http_status: response.status, elapsed_ms: Math.max(0, Date.now() - startedAt) });
    throw new Error("La respuesta de Graph no incluyó el id del mensaje enviado");
  }
  diagnostic({ event: "send.accepted", attempt_ref, kind, http_status: response.status, message_ref: messageRef(id), elapsed_ms: Math.max(0, Date.now() - startedAt) });
  return { wa_message_id: id };
}

/** Abre el catálogo público desde una conversación de WhatsApp. */
export async function sendCatalogCtaMessage(
  phone: string,
  catalogUrl: string,
): Promise<{ wa_message_id: string }> {
  return sendGraphMessage(phone, {
    type: "interactive",
    interactive: {
      type: "cta_url",
      header: { type: "text", text: "Catálogo Terra" },
      body: { text: "Claro 😊 Te comparto nuestro catálogo para que veas los productos. Si encuentras uno que te guste, puedes elegirlo y continuar desde allí." },
      footer: { text: "Atención directa por WhatsApp" },
      action: {
        name: "cta_url",
        parameters: { display_text: "Ver catálogo", url: catalogUrl },
      },
    },
  });
}

/** Solicita ubicación mediante el botón nativo de WhatsApp. */
export async function sendLocationRequestMessage(
  phone: string,
  productName: string,
): Promise<{ wa_message_id: string }> {
  return sendGraphMessage(phone, {
    type: "interactive",
    interactive: {
      type: "location_request_message",
      body: { text: `📍 Tu pedido de ${productName} está registrado. Comparte tu ubicación para coordinar la entrega.` },
      action: { name: "send_location" },
    },
  });
}

export async function sendImageMessage(
  phone: string,
  imageUrl: string,
  caption: string,
): Promise<{ wa_message_id: string }> {
  if (!imageUrl.startsWith("https://")) throw new Error("La imagen de WhatsApp debe usar HTTPS");
  if (caption.length > 1024) throw new Error("El texto del QR no puede superar 1024 caracteres");

  return sendGraphMessage(phone, { type: "image", image: { link: imageUrl, caption } });
}

export interface PhoneNumberInfo {
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
}

export async function getPhoneNumberInfo(): Promise<PhoneNumberInfo> {
  const { phoneId, token } = getMetaCredentials();
  const response = await fetch(
    `${graphBaseUrl()}/${phoneId}?fields=display_phone_number,verified_name,quality_rating`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (!response.ok) throw await graphError(response);
  return (await response.json()) as PhoneNumberInfo;
}
