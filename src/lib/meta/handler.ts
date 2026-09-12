import * as db from "@/lib/db";
import { getProductForCatalogLead } from "@/lib/catalog-storefront/server";
import { parseCatalogLeadContext } from "@/lib/catalog-storefront/whatsapp";
import { dispatchCatalogLocationRequest } from "@/lib/catalog-order-flow";
import { dispatchCatalogPaymentQr } from "@/lib/catalog-payment-flow";
import { generateAssistantReply } from "@/lib/openai";
import { sendCatalogCtaMessage, sendTextMessage } from "@/lib/meta/client";
import { diagnostic, messageRef } from "@/lib/meta/diagnostics";
import { createWebhookProcessor } from "@/lib/meta/handler-core";

/** Production wiring only; the same processor is injected with fixtures in the simulator. */
export const processWebhookPayload = createWebhookProcessor({
  db,
  getProductForCatalogLead,
  parseCatalogLeadContext,
  dispatchCatalogLocationRequest,
  dispatchCatalogPaymentQr,
  generateAssistantReply,
  sendCatalogCtaMessage,
  sendTextMessage,
  diagnostic,
  messageRef,
  channelId: () => process.env.META_PHONE_NUMBER_ID,
  publicAppUrl: () => process.env.PUBLIC_APP_URL,
  publicCatalogUrl: () => process.env.CATALOG_PUBLIC_URL,
});
