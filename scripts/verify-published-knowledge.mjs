import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(`Verifica conocimiento publicado y catálogo usando el RAG del candidato.
  node scripts/verify-published-knowledge.mjs --dry-run
  node scripts/verify-published-knowledge.mjs --live
  node scripts/verify-published-knowledge.mjs --live --semantic

Por defecto es dry-run: fuentes ficticias y ninguna llamada de red.
--live hereda SUPABASE_URL y SUPABASE_SECRET_KEY, sin leer archivos .env.
Solo permite lecturas de catálogo publicado, versiones publicadas, sus índices
y la RPC de búsqueda FTS. --semantic permite además POST a rag-search en el
mismo Supabase si RAG_SEMANTIC_SEARCH_ENABLED ya está configurado como true.
Esa función calcula embeddings y consulta el índice; no genera respuestas.
Bloquea Meta, modelos generativos, otras Edge Functions y escrituras.
Reutiliza service.ts/catalog-storefront/server.ts/core.ts/policy.ts del candidato.
Sin --semantic no prueba búsqueda semántica. No muestra contenido,
identificadores, direcciones, teléfonos, coordenadas ni valores de configuración.
La evidencia se guarda en .cache/knowledge-verification/ del candidato.`);
  process.exit(0);
}
if (args.some((arg) => !["--live", "--dry-run", "--semantic"].includes(arg)) || (args.includes("--live") && args.includes("--dry-run"))) throw new Error("Use --live o --dry-run y, opcionalmente, --semantic.");
const live = args.includes("--live");
const semanticRequested = args.includes("--semantic");
const semanticConfigured = live ? process.env.RAG_SEMANTIC_SEARCH_ENABLED === "true" : semanticRequested;
if (live && semanticRequested && !semanticConfigured) throw new Error("La búsqueda semántica no está habilitada en la configuración heredada; no se cambió esa configuración.");
const useSemantic = semanticRequested && semanticConfigured;
const environment = live ? {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  NODE_ENV: "production", RAG_SEMANTIC_SEARCH_ENABLED: String(useSemantic),
} : {
  SUPABASE_URL: "https://synthetic-verification.invalid", SUPABASE_SECRET_KEY: "synthetic-non-secret-key",
  NODE_ENV: "production", RAG_SEMANTIC_SEARCH_ENABLED: String(useSemantic),
};
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), mode: live ? "real_published_read_only" : "synthetic_dry_run",
  scope: { realKnowledge: live, realCatalog: live, writes: false, meta: false, generativeModels: false, embeddingFunctionRequestAttempted: false, semanticSearchExercised: false },
  semanticSearchConfigured: semanticConfigured, semanticSearchRequested: semanticRequested,
  sourceHashes: {}, requests: [], queries: [], suppressedDiagnostics: 0,
  localKnowledge: { read: false, exists: false, markedDraft: false },
};
let supabaseOrigin;
try {
  const configured = new URL(environment.SUPABASE_URL ?? "");
  if (configured.protocol !== "https:" || configured.username || configured.password || configured.search || configured.hash || !["", "/"].includes(configured.pathname)) throw new Error("Invalid origin");
  supabaseOrigin = configured.origin;
} catch { throw new Error("SUPABASE_URL no contiene un origen HTTPS válido; su valor se omite."); }
if (!environment.SUPABASE_SECRET_KEY) throw new Error("La credencial Supabase no está disponible en el entorno; no se leyó ningún archivo.");

const QUERIES = [
  { id: "garantia", text: "¿Qué cubre la garantía?" },
  { id: "formas_pago", text: "¿Cuáles son las formas de pago?" },
  { id: "direccion_comercial", text: "¿Cuál es la dirección de la tienda?" },
  { id: "precio_catalogo", text: "¿Cuánto cuesta el colchón?" },
];
const allowedQueryText = new Set(QUERIES.map(({ text }) => text));
const allowedModules = new Set([
  "src/lib/rag/service.ts", "src/lib/rag/core.ts", "src/lib/rag/policy.ts",
  "src/lib/rag/published-knowledge.ts", "src/lib/rag/chunking.ts",
  "src/lib/catalog-storefront/server.ts", "src/lib/catalog-storefront/whatsapp.ts",
  "src/lib/catalog-storefront/demo.ts", "src/lib/message-routing.ts",
].map((file) => path.resolve(root, file)));
const moduleCache = new Map();
const knowledgePath = path.resolve(root, "docs/rag/base-conocimiento-terra.md");
const publishedVersionIds = new Set();
const publishedChunkIds = new Set();
let publicationInventoryComplete = false;

function genericLabel(label, kind) {
  // Never print the original label: a document title can contain private text.
  if (kind === "catalog") return "Producto publicado";
  const text = label.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (/garantia/.test(text)) return "Garantía";
  if (/pago|comprobante/.test(text)) return "Formas de pago";
  if (/direccion|contacto|sucursal/.test(text)) return "Contacto comercial";
  if (/entrega|envio/.test(text)) return "Entrega";
  return "Conocimiento comercial";
}
function syntheticResponse(url, rpcBody) {
  const table = url.pathname.split("/").at(-1);
  const documents = ["garantia", "formas_pago", "direccion_comercial"];
  let data = [];
  if (table === "rag_document_versions") data = documents.map((id) => ({ id: `synthetic-version-${id}`, document_id: `synthetic-document-${id}`, status: "published",
    content: { garantia: "La garantía ficticia cubre defectos de fabricación durante 12 meses.", formas_pago: "Puedes pagar por transferencia o al recibir según la política ficticia.", direccion_comercial: "La dirección de la tienda ficticia es el Pasaje de Demostración." }[id],
    rag_documents: { title: id, kind: "company" } }));
  if (table === "rag_chunks") data = documents.map((id) => ({ id: `synthetic-chunk-${id}`, document_version_id: `synthetic-version-${id}` }));
  if (table === "catalog_products") data = [{
    id: "synthetic-product", name: "Colchón ficticio", slug: "colchon-ficticio", category: "Colchones", description: "Colchón ficticio para verificación", published: true,
    price_from: 999, availability: "available", catalog_variants: [], catalog_product_images: [],
  }];
  if (table === "match_terra_rag_chunks" || table === "rag-search") {
    const query = QUERIES.find(({ text }) => text === (rpcBody.query_text ?? rpcBody.query));
    const content = {
      garantia: "La garantía ficticia cubre defectos de fabricación durante 12 meses.",
      formas_pago: "Las formas de pago ficticias permiten pagar mediante transferencia o al recibir.",
      direccion_comercial: "La dirección de la tienda ficticia es Pasaje de Demostración, sin número real.",
    }[query.id];
    data = content ? [{ id: `synthetic-chunk-${query.id}`, source_kind: "knowledge", catalog_product_id: null, title: query.id, content, score: 1 }]
      : [{ id: "synthetic-catalog-chunk", source_kind: "catalog", catalog_product_id: "synthetic-product", title: "Colchón ficticio", content: "Colchón ficticio con precio publicado", score: 1 }];
  }
  return new Response(JSON.stringify(table === "rag-search" ? { results: data } : data), { status: 200, headers: { "Content-Type": "application/json", "Content-Range": `0-${Math.max(0, data.length - 1)}/${data.length}` } });
}

async function readOnlyFetch(input, options = {}) {
  const inputRequest = input instanceof Request ? input : null;
  const url = new URL(inputRequest?.url ?? String(input));
  const method = (options.method ?? inputRequest?.method ?? "GET").toUpperCase();
  if (url.origin !== supabaseOrigin || url.username || url.password || url.hash) throw new Error("Destino fuera de la verificación de lectura.");
  const table = url.pathname.split("/").at(-1);
  let permitted = false;
  let rpcBody;
  if (method === "GET" && url.pathname === "/rest/v1/catalog_products") permitted = url.searchParams.get("published") === "eq.true";
  if (method === "GET" && url.pathname === "/rest/v1/rag_document_versions") permitted = url.searchParams.get("status") === "eq.published"
    && ["id,document_id,rag_documents(kind)", "id,status,content"].includes(url.searchParams.get("select"));
  if (method === "GET" && url.pathname === "/rest/v1/rag_chunks") {
    const selected = url.searchParams.get("document_version_id") ?? "";
    const ids = /^in\.(\(.*\))$/.test(selected) ? selected.slice(4, -1).split(",").map((id) => id.replaceAll('"', "")) : [];
    permitted = url.searchParams.get("select") === "id,document_version_id" && url.searchParams.get("source_kind") === "eq.knowledge" && ids.length > 0 && ids.every((id) => publishedVersionIds.has(id));
  }
  if (method === "POST" && url.pathname === "/rest/v1/rpc/match_terra_rag_chunks") {
    try { rpcBody = JSON.parse(options.body ?? await inputRequest?.clone().text() ?? "{}"); } catch { rpcBody = {}; }
    permitted = allowedQueryText.has(rpcBody.query_text) && rpcBody.query_embedding === null && rpcBody.match_count === 8;
  }
  if (method === "POST" && url.pathname === "/functions/v1/rag-search" && useSemantic) {
    try { rpcBody = JSON.parse(options.body ?? await inputRequest?.clone().text() ?? "{}"); } catch { rpcBody = {}; }
    permitted = Object.keys(rpcBody).length === 1 && allowedQueryText.has(rpcBody.query);
  }
  if (!permitted) throw new Error("Operación bloqueada: únicamente lecturas comerciales aprobadas y búsqueda FTS.");
  const record = { operation: table, method, status: null, available: false };
  report.requests.push(record);
  if (table === "rag-search") {
    report.scope.embeddingFunctionRequestAttempted = live;
    report.scope.semanticSearchExercised = live;
  }
  try {
    const response = live ? await fetch(input, { ...options, redirect: "error", signal: AbortSignal.timeout(20000) }) : syntheticResponse(url, rpcBody);
    record.status = response.status;
    record.available = response.ok;
    if (response.ok && ["rag-search", "match_terra_rag_chunks"].includes(table)) {
      try {
        const payload = await response.clone().json();
        const results = table === "rag-search" ? payload?.results : payload;
        record.resultEnvelopeValid = Array.isArray(results);
        record.returnedSourceCount = Array.isArray(results) ? results.length : null;
      } catch { record.resultEnvelopeValid = false; record.returnedSourceCount = null; }
    }
    return response;
  } catch { throw new Error("Lectura comercial no disponible; detalles remotos omitidos."); }
}

function load(filename) {
  const file = path.resolve(filename);
  if (!allowedModules.has(file)) throw new Error("Importación bloqueada: módulo ajeno a la verificación RAG.");
  if (moduleCache.has(file)) return moduleCache.get(file).exports;
  const loadedModule = { exports: {} };
  moduleCache.set(file, loadedModule);
  const source = readFileSync(file, "utf8");
  report.sourceHashes[path.relative(root, file).replaceAll("\\", "/")] = createHash("sha256").update(source).digest("hex");
  const javascript = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const restrictedRequire = (specifier) => {
    if (specifier === "server-only") return {};
    if (specifier === "node:path") return path;
    if (specifier === "node:fs/promises") return { readFile: async (filename, encoding) => {
      if (path.resolve(filename) !== knowledgePath || encoding !== "utf8") throw new Error("Lectura de archivo fuera de alcance.");
      report.localKnowledge.read = true;
      if (!live) { report.localKnowledge.exists = true; report.localKnowledge.markedDraft = true; return "---\nestado: borrador\n---\n# Fuente ficticia"; }
      const content = await readFile(knowledgePath, encoding);
      report.localKnowledge.exists = true;
      report.localKnowledge.markedDraft = /^estado:\s*borrador\s*$/im.test(content);
      return content;
    } };
    if (specifier === "@supabase/supabase-js") return { createClient: (url, key, options) => createClient(url, key, { ...options, global: { fetch: readOnlyFetch } }) };
    if (specifier === "@/lib/meta/client") return { getPhoneNumberInfo: () => { throw new Error("Meta está bloqueado en esta verificación."); } };
    const target = specifier.startsWith("@/") ? path.resolve(root, "src", specifier.slice(2)) : specifier.startsWith(".") ? path.resolve(path.dirname(file), specifier) : "";
    return load(target.endsWith(".ts") ? target : target + ".ts");
  };
  const suppress = () => { report.suppressedDiagnostics += 1; };
  const context = vm.createContext({ URL, process: { env: environment, cwd: () => root }, console: { warn: suppress, error: suppress, log: suppress } });
  const run = new vm.Script(`(function(require,module,exports){${javascript}\n})`, { filename: file }).runInContext(context, { timeout: 5000 });
  run(restrictedRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

async function inspectPublishedInventory(client) {
  const { data: versions, error } = await client.from("rag_document_versions").select("id,document_id,rag_documents(kind)").eq("status", "published").limit(1000);
  if (error || !Array.isArray(versions)) return { status: "unavailable", publishedDocuments: null, publishedChunks: null };
  if (versions.length >= 1000) return { status: "inventory_limit_reached", publishedDocuments: versions.length, publishedChunks: null };
  for (const version of versions) publishedVersionIds.add(version.id);
  const kinds = {};
  for (const version of versions) {
    const kind = ["company", "delivery", "policy", "faq", "product_supplement", "category"].includes(version.rag_documents?.kind) ? version.rag_documents.kind : "unclassified";
    kinds[kind] = (kinds[kind] ?? 0) + 1;
  }
  if (versions.length === 0) { publicationInventoryComplete = true; return { status: "empty", publishedDocuments: 0, publishedChunks: 0, kinds }; }
  const { data: chunks, error: chunkError } = await client.from("rag_chunks").select("id,document_version_id").eq("source_kind", "knowledge").in("document_version_id", [...publishedVersionIds]).limit(1000);
  if (chunkError || !Array.isArray(chunks)) return { status: "index_unavailable", publishedDocuments: versions.length, publishedChunks: null, kinds };
  for (const chunk of chunks) publishedChunkIds.add(chunk.id);
  publicationInventoryComplete = chunks.length < 1000;
  return { status: publicationInventoryComplete ? "available" : "index_inventory_limit_reached", publishedDocuments: versions.length, publishedChunks: chunks.length, kinds };
}

try {
  const catalog = load(path.resolve(root, "src/lib/catalog-storefront/server.ts"));
  const rag = load(path.resolve(root, "src/lib/rag/service.ts"));
  const policy = load(path.resolve(root, "src/lib/rag/policy.ts"));
  report.publishedKnowledge = await inspectPublishedInventory(catalog.getCatalogServerClient());
  const requestStart = report.requests.length;
  const products = await catalog.getPublishedCatalogProductsForRag();
  const catalogUnavailable = report.requests.slice(requestStart).some((request) => !request.available);
  report.catalog = { status: catalogUnavailable ? "unavailable" : products.length ? "available" : "empty", publishedProducts: catalogUnavailable ? null : products.length };
  for (const query of QUERIES) {
    const before = report.requests.length;
    try {
      const result = await rag.buildRagContext([{ id: 1, conversation_id: 1, role: "user", content: query.text, wa_message_id: null, created_at: 0 }]);
      const sources = result.sources.map((source) => ({
        kind: source.kind, label: genericLabel(source.label, source.kind),
        publishedIndexVerified: source.kind === "knowledge" ? publicationInventoryComplete && publishedChunkIds.has(source.id.replace(/^knowledge-/, "")) : null,
        publishedDocumentVerified: source.kind === "knowledge" ? publicationInventoryComplete && [...publishedVersionIds].some((id) => source.id.startsWith(`published-${id}-`)) : null,
      }));
      const requests = report.requests.slice(before);
      const semanticSucceeded = requests.some((request) => request.operation === "rag-search" && request.available && request.resultEnvelopeValid);
      const ftsSucceeded = requests.some((request) => request.operation === "match_terra_rag_chunks" && request.available && request.resultEnvelopeValid);
      report.queries.push({ id: query.id, status: "completed", contextAvailable: Boolean(result.context.trim()), sourceCount: sources.length, sources,
        answerSupportedByPolicy: !policy.requiresHumanHandoffForQuery(query.text, result.sources),
        semanticRequestAttempted: requests.some((request) => request.operation === "rag-search"),
        semanticRequestSucceeded: semanticSucceeded, indexRequestSucceeded: semanticSucceeded || ftsSucceeded,
        retrievalPath: sources.some((source) => source.publishedDocumentVerified) ? "published_lexical" : semanticSucceeded ? "semantic_index" : ftsSucceeded ? "fts_index" : "lexical_fallback",
        semanticFallbackUsed: useSemantic && !semanticSucceeded,
      });
    } catch { report.queries.push({ id: query.id, status: "unavailable", sourceCount: null, contextAvailable: false }); }
  }
} catch { report.failure = "verification_unavailable_details_omitted"; }
report.finishedAt = new Date().toISOString();
report.summary = {
  infrastructureUnavailable: Boolean(report.failure) || report.requests.some((request) => !request.available)
    || ["unavailable", "index_unavailable"].includes(report.publishedKnowledge?.status) || report.catalog?.status === "unavailable",
  inventoryIncomplete: /limit_reached/.test(report.publishedKnowledge?.status ?? ""),
  missingEvidenceQueries: report.queries.filter((query) => !query.contextAvailable || !query.answerSupportedByPolicy).length,
  queriesCompleted: report.queries.filter((query) => query.status === "completed").length,
  knowledgeEmpty: report.publishedKnowledge?.status === "empty", catalogEmpty: report.catalog?.status === "empty",
  contentApproval: "not_performed", modelAnswerEvaluated: false,
};
const outputDirectory = path.resolve(root, ".cache/knowledge-verification");
await mkdir(outputDirectory, { recursive: true });
const output = path.resolve(outputDirectory, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({ mode: report.mode, publishedKnowledge: report.publishedKnowledge, catalog: report.catalog, queries: report.queries, summary: report.summary }, null, 2));
console.log(`Evidencia sin contenido: ${path.relative(root, output)}`);
process.exitCode = report.summary.infrastructureUnavailable || report.summary.inventoryIncomplete || report.summary.queriesCompleted !== QUERIES.length ? 1 : 0;
