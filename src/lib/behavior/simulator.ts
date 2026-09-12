import type { CatalogLeadContext, CatalogOrder, Conversation, Message } from "@/lib/db";
import type { CatalogProduct } from "@/lib/catalog-storefront/types";
import { createWebhookProcessor, type WebhookDependencies } from "@/lib/meta/handler-core";
import { formatRetrievedSources, parseKnowledgeBase, retrieveApprovedSources, type RetrievedSource } from "@/lib/rag/core";
import { composeInstructions, type ReplyContext } from "./instructions";
import { createAssistantResponder } from "./respond";

export const SIMULATION_STAGES = ["orientation", "awaiting_location", "awaiting_payment", "payment_proof_received"] as const;
export type SimulationStage = typeof SIMULATION_STAGES[number];
export const MAX_SIMULATION_MESSAGE_LENGTH = 4096;

export interface SimulationInput {
  instructions: string;
  stage: SimulationStage;
  message: string;
}

export interface SimulationResult {
  replies: string[];
  route: string;
  modelCalled: boolean;
  sources: Array<{ label: string; kind: RetrievedSource["kind"] }>;
  effectiveInstructions: string;
  notes: string[];
}

// These records deliberately do not describe Terra's real commercial policies.
const SYNTHETIC_KNOWLEDGE = parseKnowledgeBase(`# Fuentes ficticias para una prueba local
## Garantía ficticia
En esta demostración la garantía del colchón de prueba dura 12 meses. Este dato es ficticio y no describe una garantía de Terra.
## Métodos de pago ficticios
En esta demostración se puede pagar mediante transferencia o al recibir. Los métodos y formas de pago son ficticios. Un comprobante queda en revisión humana.
## Dirección de sucursal ficticia
La dirección de la tienda de demostración es Pasaje de Prueba, local de demostración. La sucursal abre de lunes a viernes. No corresponde a una dirección ni un horario real.
## Entrega ficticia
La entrega del producto de demostración demora tres días en la zona de prueba. Es un plazo ficticio para comprobar la recuperación de información.
`);

const SYNTHETIC_PRODUCT: CatalogProduct = {
  id: "synthetic-demo-product", externalCode: null, slug: "synthetic-demo-product",
  name: "Colchón ficticio de demostración", category: "Colchones",
  shortDescription: "Producto ficticio; precio y disponibilidad solo para pruebas.",
  description: "Ejemplo sintético para probar una consulta comercial sin consultar el catálogo real.",
  specifications: ["Firmeza intermedia ficticia"], priceFrom: 999, compareAtPriceFrom: null,
  availability: "available", published: true, featured: false, sortOrder: 0, images: [],
  variants: [{
    id: "synthetic-demo-variant", externalCode: null, label: "Dos plazas de prueba",
    price: 999, compareAtPrice: null, availability: "available", active: true, sortOrder: 0,
  }],
};

const SYNTHETIC_RECIPIENT = "synthetic-simulator-customer";
const SYNTHETIC_CHANNEL = "synthetic-simulator-channel";
const SYNTHETIC_ORDER_CODE = "T-DEMO-0001";

function syntheticOrder(status: CatalogOrder["status"]): CatalogOrder {
  return {
    id: "synthetic-demo-order", public_code: SYNTHETIC_ORDER_CODE, conversation_id: 1,
    product_id: SYNTHETIC_PRODUCT.id, product_slug: SYNTHETIC_PRODUCT.slug, product_name: SYNTHETIC_PRODUCT.name,
    variant_id: SYNTHETIC_PRODUCT.variants[0].id, variant_label: SYNTHETIC_PRODUCT.variants[0].label,
    price: 999, status, location_requested: status === "awaiting_chat_confirmation" ? 0 : 1,
    latitude: null, longitude: null, location_name: null, location_address: null, created_at: 0, updated_at: 0,
  };
}

/**
 * One independent synthetic turn through the same handler and responder.
 * All I/O boundaries below are memory-only. There is no operational state,
 * provider client, network, filesystem or environment access in this module.
 */
export async function simulateBehavior(input: SimulationInput): Promise<SimulationResult> {
  const conversation: Conversation = {
    id: 1, phone: SYNTHETIC_RECIPIENT, name: "Cliente ficticio", mode: "AI", last_message_at: null, created_at: 0,
  };
  let activeOrder: CatalogOrder | undefined = input.stage === "orientation" ? undefined : syntheticOrder(input.stage);
  let lead: CatalogLeadContext | null = activeOrder
    ? { productId: SYNTHETIC_PRODUCT.id, variantId: SYNTHETIC_PRODUCT.variants[0].id } : null;
  const history: Message[] = [];
  const processed = new Set<string>();
  const replies: string[] = [];
  const actions: string[] = [];
  let modelCalled = false;
  let retrieved = false;
  let sources: RetrievedSource[] = [];
  let effectiveInstructions = "";
  const initialContext: ReplyContext = activeOrder ? {
    orderStatus: activeOrder.status, productName: activeOrder.product_name, variantLabel: activeOrder.variant_label,
  } : {};

  const responder = createAssistantResponder({
    getActiveBehavior: () => ({ id: 0, instructions: input.instructions, createdAt: "1970-01-01T00:00:00.000Z" }),
    retrieve: async (safeHistory, selectedLead) => {
      retrieved = true;
      const query = [...safeHistory].reverse().find((message) => message.role === "user")?.content ?? "";
      sources = retrieveApprovedSources({
        query, products: [SYNTHETIC_PRODUCT], knowledge: SYNTHETIC_KNOWLEDGE, selectedLead,
      });
      return { sources, context: formatRetrievedSources(sources) };
    },
    complete: async ({ instructions }) => {
      modelCalled = true;
      effectiveInstructions = instructions;
      const labels = sources.map((source) => source.label).join(", ");
      // This response is intentionally deterministic: it demonstrates the path,
      // not the quality, wording or obedience of an actual language model.
      return labels
        ? `Respuesta simulada: la consulta recibió estas fuentes ficticias: ${labels}.`
        : "Respuesta simulada: las instrucciones llegaron al generador sin fuentes comerciales relevantes.";
    },
  });

  function accepted(kind: string) {
    actions.push(kind);
    return { wa_message_id: `synthetic-${kind}-${actions.length}` };
  }

  function assertRecipient(recipient: string) {
    if (recipient !== SYNTHETIC_RECIPIENT) throw new Error("El simulador solo acepta su destinatario ficticio.");
  }

  const db: WebhookDependencies["db"] = {
    getOrCreateConversation: () => ({ ...conversation }),
    getConversationById: (id) => id === 1 ? { ...conversation } : undefined,
    getRecentHistory: (_id, limit = 20) => history.slice(-limit).map((message) => ({ ...message })),
    insertMessage: (_id, role, content, wamid) => {
      const id = history.length + 1;
      history.push({ id, conversation_id: 1, role, content, wa_message_id: wamid ?? null, created_at: 0 });
      return id;
    },
    updateMessageWaId: (id, wamid) => {
      const message = history.find((item) => item.id === id);
      if (message) message.wa_message_id = wamid;
    },
    wasMessageProcessed: (id) => processed.has(id),
    markMessageProcessed: (id) => {
      if (processed.has(id)) return false;
      processed.add(id);
      return true;
    },
    setMode: (_id, mode) => { conversation.mode = mode; return { ...conversation }; },
    createCatalogCheckoutSession: () => "synthetic-checkout-token",
    getCatalogLeadContext: () => lead ? { ...lead } : null,
    setCatalogLeadContext: (_id, productId, variantId) => { lead = { productId, variantId }; },
    getLatestActiveCatalogOrderForConversation: () => activeOrder ? { ...activeOrder } : undefined,
    getUnambiguousActiveCatalogOrderForConversation: () => activeOrder ? { ...activeOrder } : undefined,
    getLocationRequestedCatalogOrderForConversation: () => activeOrder?.status === "awaiting_location" ? { ...activeOrder } : undefined,
    claimCatalogOrder: (code) => {
      if (code !== SYNTHETIC_ORDER_CODE) return { result: "not_found", order: undefined };
      if (activeOrder) return { result: "already_confirmed", order: { ...activeOrder } };
      activeOrder = syntheticOrder("awaiting_location");
      lead = { productId: SYNTHETIC_PRODUCT.id, variantId: SYNTHETIC_PRODUCT.variants[0].id };
      return { result: "claimed", order: { ...activeOrder } };
    },
    saveCatalogOrderLocation: () => { throw new Error("El simulador de texto no procesa ubicaciones ni adjuntos."); },
    markCatalogOrderPaymentProof: () => { throw new Error("El simulador de texto no procesa comprobantes ni adjuntos."); },
  };

  const process = createWebhookProcessor({
    db,
    generateAssistantReply: responder,
    parseCatalogLeadContext: () => null,
    getProductForCatalogLead: async (productId, variantId) => productId === SYNTHETIC_PRODUCT.id ? {
      product: SYNTHETIC_PRODUCT, variant: SYNTHETIC_PRODUCT.variants.find((variant) => variant.id === variantId) ?? null,
    } : null,
    sendTextMessage: async (recipient, content) => {
      assertRecipient(recipient);
      replies.push(content);
      return accepted("text");
    },
    sendCatalogCtaMessage: async (recipient) => {
      assertRecipient(recipient);
      replies.push("[Botón Ver catálogo simulado; no se envió a WhatsApp.]");
      return accepted("catalog");
    },
    dispatchCatalogLocationRequest: async () => {
      replies.push("[Solicitud GPS simulada; no se solicita ni registra una ubicación real.]");
      accepted("gps");
      return "sent";
    },
    dispatchCatalogPaymentQr: async () => {
      replies.push("[Envío QR simulado; no se obtuvo ni envió un QR real.]");
      accepted("qr");
      return "sent";
    },
    diagnostic: () => undefined,
    messageRef: () => undefined,
    channelId: () => SYNTHETIC_CHANNEL,
    publicAppUrl: () => "https://agent.invalid",
    publicCatalogUrl: () => "https://catalog.invalid",
  });

  await process({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
    metadata: { phone_number_id: SYNTHETIC_CHANNEL },
    messages: [{ id: "synthetic-turn", from: SYNTHETIC_RECIPIENT, type: "text", text: { body: input.message } }],
  } }] }] });

  const notes = [
    "Prueba aislada con un pedido, producto y documentos ficticios. No consulta cuentas, datos ni documentos publicados reales.",
    "El generador está simulado: comprueba reglas y conexión de instrucciones; no evalúa el tono ni la calidad de un modelo real.",
    "Cada prueba es independiente; no guarda el mensaje ni conserva historial entre pruebas. Solo admite texto.",
  ];
  if (!modelCalled) {
    effectiveInstructions = composeInstructions(input.instructions, formatRetrievedSources(sources), initialContext);
    notes.push("El modelo no fue llamado. Las instrucciones mostradas son una vista de configuración, no instrucciones enviadas en este recorrido.");
  }
  const route = conversation.mode === "HUMAN" ? "Atención humana"
    : actions.includes("gps") ? "Confirmación y solicitud GPS simulada"
      : actions.includes("qr") ? "Envío QR simulado"
        : actions.includes("catalog") ? "Catálogo"
          : modelCalled ? "Generador simulado"
            : retrieved ? "Consulta sin evidencia suficiente"
              : "Respuesta automática";
  return { replies, route, modelCalled, sources: sources.map(({ label, kind }) => ({ label, kind })), effectiveInstructions, notes };
}
