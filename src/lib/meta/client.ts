interface GraphErrorBody {
  error?: { message?: string; code?: number };
  messages?: Array<{ id?: string }>;
}

interface GraphMessageResponse {
  messages?: Array<{ id?: string }>;
}

type GraphMessagePayload = Record<string, unknown>;

export class MetaGraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "MetaGraphError";
  }
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
  try {
    const parsed = JSON.parse(text) as GraphErrorBody;
    detail = parsed.error?.message || text;
    code = parsed.error?.code;
  } catch {
    // Meta no siempre devuelve JSON ante errores de infraestructura.
  }
  return new MetaGraphError(`Graph API ${response.status}: ${detail}`, response.status, code);
}

/** Distingue un token vencido de otros fallos de configuración o de Graph. */
export function isExpiredMetaAccessToken(error: unknown): boolean {
  if (!(error instanceof MetaGraphError)) return false;
  return /(?:access token|session).*(?:has )?expired/i.test(error.message);
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
  const { phoneId, token } = getMetaCredentials();
  const response = await fetch(`${graphBaseUrl()}/${phoneId}/messages`, {
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

  if (!response.ok) throw await graphError(response);
  const json = (await response.json()) as GraphMessageResponse;
  const id = json.messages?.[0]?.id;
  if (!id) throw new Error("La respuesta de Graph no incluyó el id del mensaje enviado");
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
      body: { text: "Explora nuestros productos y elige el que más te guste." },
      footer: { text: "Atención directa por WhatsApp" },
      action: {
        name: "cta_url",
        parameters: { display_text: "Ver catálogo", url: catalogUrl },
      },
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
