import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";

// Only these pure production modules may execute. An accidental import of a
// real database, Meta client, RAG service or provider fails before it runs.
const PURE_MODULES = [
  "src/lib/meta/handler-core.ts", "src/lib/behavior/respond.ts",
  "src/lib/behavior/instructions.ts", "src/lib/behavior/privacy.ts",
  "src/lib/system-prompt.ts", "src/lib/handoff.ts", "src/lib/order-code.ts",
  "src/lib/message-routing.ts", "src/lib/rag/core.ts", "src/lib/rag/policy.ts",
];

export function loadProductionCore(root) {
  const allowed = new Set(PURE_MODULES.map((path) => resolve(root, path)));
  const cache = new Map();
  const sourceHashes = {};
  function load(filename) {
    const path = resolve(filename);
    if (!allowed.has(path)) throw new Error("Evaluación bloqueada: se intentó importar un módulo fuera de la lista pura.");
    if (cache.has(path)) return cache.get(path).exports;
    const loadedModule = { exports: {} };
    cache.set(path, loadedModule);
    const source = readFileSync(path, "utf8");
    sourceHashes[relative(root, path).replaceAll("\\", "/")] = crypto.createHash("sha256").update(source).digest("hex");
    const javascript = ts.transpileModule(source, {
      fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const restrictedRequire = (specifier) => {
      if (specifier === "node:crypto") return { default: crypto };
      const target = specifier.startsWith("@/") ? resolve(root, "src", specifier.slice(2))
        : specifier.startsWith(".") ? resolve(dirname(path), specifier) : "";
      return load(target.endsWith(".ts") ? target : target + ".ts");
    };
    const context = vm.createContext({ URL });
    const run = new vm.Script(`(function(require,module,exports){${javascript}\n})`, { filename: path }).runInContext(context, { timeout: 5000 });
    run(restrictedRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return Object.assign({ sourceHashes }, ...[
    "src/lib/meta/handler-core.ts", "src/lib/behavior/respond.ts",
    "src/lib/rag/core.ts", "src/lib/system-prompt.ts",
  ].map((path) => load(resolve(root, path))));
}

export function createEvaluationConversation(core, fixture, scenario, complete) {
  const product = fixture.product;
  const channel = "synthetic-evaluation-channel";
  const recipient = "synthetic-evaluation-recipient";
  const conversation = { id: 1, phone: recipient, name: "Cliente ficticio", mode: "AI", last_message_at: null, created_at: 0 };
  const history = [];
  const processed = new Set();
  const actions = [];
  const replies = [];
  const providerCalls = [];
  const diagnostics = [];
  const knowledge = core.parseKnowledgeBase(scenario.knowledge ?? fixture.knowledge);
  let active = { id: 0, instructions: core.SYSTEM_PROMPT, createdAt: new Date(0).toISOString() };
  let order = scenario.stage === "orientation" ? undefined : makeOrder(scenario.stage);
  let lead = order ? { productId: product.id, variantId: product.variants[0].id } : null;
  let sources = [];
  let turnIndex = 0;
  function makeOrder(status) {
    return {
      id: "synthetic-evaluation-order", public_code: "T-DEMO-0001", conversation_id: 1,
      product_id: product.id, product_slug: product.slug, product_name: product.name,
      variant_id: product.variants[0].id, variant_label: product.variants[0].label,
      price: product.variants[0].price, status, location_requested: status === "awaiting_chat_confirmation" ? 0 : 1,
      latitude: null, longitude: null, location_name: null, location_address: null, created_at: 0, updated_at: 0,
    };
  }
  const clone = (value) => value ? { ...value } : value;
  const responder = core.createAssistantResponder({
    getActiveBehavior: () => clone(active),
    retrieve: async (safeHistory, selectedLead) => {
      const query = [...safeHistory].reverse().find((message) => message.role === "user")?.content ?? "";
      sources = core.retrieveApprovedSources({ query, products: [product], knowledge, selectedLead });
      return { sources, context: core.formatRetrievedSources(sources) };
    },
    complete: async (input) => {
      const call = { promptVersion: active.id, instructions: input.instructions, input: input.history.map(clone), sources: sources.map(({ kind, label }) => ({ kind, label })) };
      providerCalls.push(call);
      return complete(input, { scenarioId: scenario.id, turnIndex, sources });
    },
  });
  function accepted(kind, destination = recipient) {
    if (destination !== recipient) throw new Error("La evaluación solo acepta el destinatario ficticio.");
    actions.push(kind);
    return { wa_message_id: `synthetic-${kind}-${actions.length}` };
  }
  const process = core.createWebhookProcessor({
    db: {
      getOrCreateConversation: () => clone(conversation), getConversationById: () => clone(conversation),
      getRecentHistory: (_id, limit = 20) => history.slice(-limit).map(clone),
      insertMessage: (_id, role, content, wamid) => {
        const id = history.length + 1;
        history.push({ id, conversation_id: 1, role, content, wa_message_id: wamid ?? null, created_at: 0 });
        return id;
      },
      updateMessageWaId: (id, wamid) => { history.find((message) => message.id === id).wa_message_id = wamid; },
      wasMessageProcessed: (id) => processed.has(id),
      markMessageProcessed: (id) => { if (processed.has(id)) return false; processed.add(id); return true; },
      setMode: (_id, mode) => { conversation.mode = mode; return clone(conversation); },
      createCatalogCheckoutSession: () => "synthetic-evaluation-checkout",
      getCatalogLeadContext: () => clone(lead), setCatalogLeadContext: (_id, productId, variantId) => { lead = { productId, variantId }; },
      getLatestActiveCatalogOrderForConversation: () => clone(order),
      getLocationRequestedCatalogOrderForConversation: () => order?.status === "awaiting_location" ? clone(order) : undefined,
      claimCatalogOrder: (code) => {
        if (code !== "T-DEMO-0001") return { result: "not_found", order: undefined };
        if (order) return { result: "already_confirmed", order: clone(order) };
        order = makeOrder("awaiting_location");
        lead = { productId: product.id, variantId: product.variants[0].id };
        return { result: "claimed", order: clone(order) };
      },
      saveCatalogOrderLocation: () => { throw new Error("No se admiten ubicaciones en esta evaluación de texto."); },
      markCatalogOrderPaymentProof: () => { throw new Error("No se admiten comprobantes en esta evaluación de texto."); },
    },
    generateAssistantReply: responder, parseCatalogLeadContext: () => null,
    getProductForCatalogLead: async () => ({ product, variant: product.variants[0] }),
    sendTextMessage: async (destination, content) => { replies.push(content); return accepted("text", destination); },
    sendCatalogCtaMessage: async (destination) => { replies.push("[Botón de catálogo simulado]"); return accepted("catalog", destination); },
    dispatchCatalogLocationRequest: async () => { replies.push("[Solicitud GPS simulada]"); accepted("gps"); return "sent"; },
    dispatchCatalogPaymentQr: async () => { replies.push("[Envío QR simulado]"); accepted("qr"); return "sent"; },
    diagnostic: ({ event }) => diagnostics.push(event), messageRef: () => undefined,
    channelId: () => channel, publicAppUrl: () => "https://agent.invalid", publicCatalogUrl: () => "https://catalog.invalid",
  });
  return {
    async turn(fixtureTurn) {
      turnIndex += 1;
      if (fixtureTurn.publishAppend) active = { id: active.id + 1, instructions: `${core.SYSTEM_PROMPT}\n\n${fixtureTurn.publishAppend}`, createdAt: new Date(0).toISOString() };
      const offsets = { actions: actions.length, replies: replies.length, calls: providerCalls.length, diagnostics: diagnostics.length };
      sources = [];
      await process({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: channel }, messages: [{ id: `synthetic-turn-${turnIndex}`, from: recipient, type: "text", text: { body: fixtureTurn.message } }],
      } }] }] });
      return { message: fixtureTurn.message, actions: actions.slice(offsets.actions), replies: replies.slice(offsets.replies),
        calls: providerCalls.slice(offsets.calls), diagnostics: diagnostics.slice(offsets.diagnostics),
        promptVersion: active.id, mode: conversation.mode, orderStatus: order?.status ?? null,
        sources: sources.map(({ kind, label }) => ({ kind, label })),
      };
    },
  };
}

const normalized = (text) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
export function checkTurn(result, expected, dryRun, previousVersion) {
  const checks = [];
  const check = (name, pass, semantic = false) => checks.push({ name, status: semantic && dryRun && result.calls.length ? "not_evaluated_dry_run" : pass ? "passed" : "failed" });
  const text = result.replies.join("\n");
  if (expected.modelCalled !== undefined) check("ruta_del_modelo", Boolean(result.calls.length) === expected.modelCalled);
  if (expected.mode) check("modo_de_atencion", result.mode === expected.mode);
  if (expected.orderStatus) check("estado_del_pedido", result.orderStatus === expected.orderStatus);
  if (expected.replyCount !== undefined) check("cantidad_de_respuestas", result.replies.length === expected.replyCount);
  for (const action of expected.forbidActions ?? []) check(`sin_accion_${action}`, !result.actions.includes(action));
  for (const [action, count] of Object.entries(expected.actionsCount ?? {})) check(`cantidad_${action}`, result.actions.filter((value) => value === action).length === count);
  for (const part of expected.contains ?? []) check(`respuesta_contiene_${part}`, normalized(text).includes(normalized(part)), true);
  for (const part of expected.forbidText ?? []) check(`respuesta_omite_${part}`, !normalized(text).includes(normalized(part)), true);
  for (const part of expected.historyContains ?? []) check(`memoria_entregada_${part}`, result.calls.some((call) => call.input.some((message) => normalized(message.content).includes(normalized(part)))));
  if (expected.maxWords) check("extension_maxima", text.trim().split(/\s+/).length <= expected.maxWords, true);
  if (expected.startsWith) check("estilo_publicado_observable", text.startsWith(expected.startsWith), true);
  if (expected.promptChanged) check("nueva_version_consumida", result.calls.length > 0 && result.calls.every((call) => call.promptVersion > previousVersion));
  check("sin_fallo_del_generador", !result.diagnostics.includes("rag.failed"));
  check("sin_aprobacion_automatica", !/(?:tu|el|su) pago (?:ha sido |est[aá] |qued[oó] )?aprobado|(?:ya |hemos )?(?:aprobamos|validamos) (?:tu|el|su) pago/i.test(text), true);
  check("sin_razonamiento_interno", !/thinking process|reasoning process|<think>|analyze user input|formulate response/i.test(text), true);
  return checks;
}
