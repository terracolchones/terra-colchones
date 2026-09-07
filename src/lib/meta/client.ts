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

/** Abre la landing de compra vinculada al pedido de esta conversación. */
export async function sendLandingCtaMessage(
  phone: string,
  landingUrl: string,
  productName: string,
): Promise<{ wa_message_id: string }> {
  return sendGraphMessage(phone, {
    type: "interactive",
    interactive: {
      type: "cta_url",
      header: { type: "text", text: "🛋️ Terra" },
      body: { text: `Elige el color de tu ${productName} y confirma tu pedido.` },
      footer: { text: "🛒 Compra segura por WhatsApp" },
      action: {
        name: "cta_url",
        parameters: { display_text: "Ver producto", url: landingUrl },
      },
    },
  });
}

/** Selector nativo: no abre navegador ni saca al cliente de su conversación. */
export async function sendColorSelectorMessage(
  phone: string,
  orderId: string,
  imageUrl?: string,
): Promise<{ wa_message_id: string }> {
  return sendGraphMessage(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      header: imageUrl
        ? { type: "image", image: { link: imageUrl } }
        : { type: "text", text: "🛋️ Terra" },
      body: { text: "Sillón Giratorio Lounge Confort\nElige el color que prefieres." },
      footer: { text: "Compra segura por WhatsApp" },
      action: {
        buttons: [
          { type: "reply", reply: { id: `color:${orderId}:Amarillo`, title: "Amarillo" } },
          { type: "reply", reply: { id: `color:${orderId}:Gris`, title: "Gris" } },
          { type: "reply", reply: { id: `color:${orderId}:Azul`, title: "Azul" } },
        ],
      },
    },
  });
}

/** Segundo paso nativo: el cliente confirma antes de que se solicite el GPS. */
export async function sendOrderConfirmationMessage(
  phone: string,
  orderId: string,
  color: string,
  imageUrl?: string,
): Promise<{ wa_message_id: string }> {
  return sendGraphMessage(phone, {
    type: "interactive",
    interactive: {
      type: "button",
      header: imageUrl
        ? { type: "image", image: { link: imageUrl } }
        : { type: "text", text: "🛋️ Terra" },
      body: { text: `Elegiste color ${color}. ¿Confirmas tu pedido?` },
      footer: { text: "Después solicitaremos tu ubicación" },
      action: {
        buttons: [
          { type: "reply", reply: { id: `confirm:${orderId}`, title: "Confirmar pedido" } },
          { type: "reply", reply: { id: `colors:${orderId}`, title: "Cambiar color" } },
        ],
      },
    },
  });
}

/** Solicita GPS con el botón nativo de WhatsApp, no con un enlace externo. */
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
