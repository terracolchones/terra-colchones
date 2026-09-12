import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkTurn, createEvaluationConversation, loadProductionCore } from "./behavior-eval-runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(`Evaluación de conversaciones ficticias con el handler y responder de producción.
  node scripts/eval-agent-behavior.mjs --dry-run
  node scripts/eval-agent-behavior.mjs --live [--case scenario_id] [--output .cache/behavior-eval/result.json]

--dry-run (predeterminado): sin red, no evalúa calidad ni tono del modelo.
--live: usa OPENAI_API_KEY ya disponible en el entorno y OPENAI_MODEL; no lee archivos .env.
Usa únicamente el proveedor configurado: api.openai.com/v1 o openrouter.ai/api/v1, endpoint responses.
No cambia de proveedor ante errores y no envía WhatsApp.
Las fuentes son ficticias, no consultan documentos comerciales publicados ni bases reales.
La publicación del prompt es en memoria; la persistencia se cubre por pruebas del store/panel.
Los resultados requieren revisión semántica antes de considerar aprobado el comportamiento.`);
  process.exit(0);
}
function valueAfter(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Falta valor de ${flag}.`);
  return value;
}
const validFlags = new Set(["--live", "--dry-run", "--case", "--output"]);
for (let index = 0; index < args.length; index += 1) {
  if (!validFlags.has(args[index])) throw new Error("Argumento de evaluación no reconocido.");
  if (args[index] === "--case" || args[index] === "--output") index += 1;
}
if (args.includes("--live") && args.includes("--dry-run")) throw new Error("Elija --live o --dry-run.");
const live = args.includes("--live");
const apiKey = live ? process.env.OPENAI_API_KEY : undefined;
const configuredBase = live ? process.env.OPENAI_BASE_URL || "https://api.openai.com/v1" : "https://api.openai.com/v1";
if (live && !apiKey) throw new Error("Evaluación real pendiente: OPENAI_API_KEY no está disponible en el entorno. No se leyó ningún archivo de credenciales.");
const allowedProviderBases = new Set(["https://api.openai.com/v1", "https://openrouter.ai/api/v1"]);
const providerBase = configuredBase.replace(/\/$/, "");
if (live && !allowedProviderBases.has(providerBase)) throw new Error("El proveedor configurado no coincide con los destinos explícitos permitidos para esta evaluación.");
const core = loadProductionCore(root);
const modelEnvironment = { model: process.env.OPENAI_MODEL, baseURL: providerBase };
const modelSettings = core.getAssistantModelSettings(modelEnvironment);
const fixture = JSON.parse(await readFile(new URL("./fixtures/behavior-eval.json", import.meta.url), "utf8"));
const selectedCase = valueAfter("--case");
const scenarios = fixture.scenarios.filter((scenario) => !selectedCase || scenario.id === selectedCase);
if (scenarios.length === 0) throw new Error("Escenario no encontrado en las fixtures.");
const cacheRoot = resolve(root, ".cache", "behavior-eval");
const output = resolve(root, valueAfter("--output") ?? relative(root, resolve(cacheRoot, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`)));
const relativeOutput = relative(cacheRoot, output);
if (!relativeOutput || relativeOutput.startsWith("..") || resolve(cacheRoot, relativeOutput) !== output) throw new Error("El resultado debe guardarse dentro de .cache/behavior-eval/ del checkout.");
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), mode: live ? "real_model_synthetic_io" : "dry_run_no_model",
  model: live ? modelSettings.model : null, providerOrigin: live ? new URL(providerBase).origin : null, fixtureNotice: fixture.notice,
  requestSettings: live ? modelSettings : null,
  scope: { realModel: live, realWhatsApp: false, realDatabase: false, realCommercialKnowledge: false, persistedPromptPublication: false },
  semanticReview: "pending", scenarios: [], usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
};
report.sourceHashes = core.sourceHashes;
report.fixtureSha256 = createHash("sha256").update(JSON.stringify(fixture)).digest("hex");
let providerFailed = false;
async function complete({ instructions, history }) {
  if (!live) return "[Generador simulado: este texto no demuestra tono, memoria semántica ni calidad de una IA real.]";
  report.usage.calls += 1;
  let response;
  try {
    response = await fetch(`${providerBase}/responses`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(core.buildAssistantModelRequest({ instructions, history }, modelEnvironment)),
    });
  } catch {
    providerFailed = true;
    throw new Error("Proveedor inaccesible; sin reintentos automáticos.");
  }
  if (!response.ok) {
    providerFailed = true;
    // Do not log the response body, headers, credentials or remote diagnostics.
    report.providerFailure = { status: response.status };
    throw new Error("El proveedor rechazó la evaluación; respuesta remota omitida.");
  }
  let payload;
  try { payload = await response.json(); }
  catch {
    providerFailed = true;
    report.providerFailure = { status: "unreadable_response" };
    throw new Error("El proveedor devolvió una respuesta no utilizable; contenido omitido.");
  }
  report.usage.inputTokens += payload.usage?.input_tokens ?? 0;
  report.usage.outputTokens += payload.usage?.output_tokens ?? 0;
  try { return core.readCompletedAssistantText(payload); }
  catch {
    providerFailed = true;
    report.providerFailure = { status: "incomplete_or_empty_response" };
    throw new Error("La evaluación recibió una respuesta incompleta o vacía.");
  }
}
function evidenceForTurn(result) {
  const { calls, ...safeResult } = result;
  return { ...safeResult, providerCalls: calls.map((call) => ({
    promptVersion: call.promptVersion, promptSha256: createHash("sha256").update(call.instructions).digest("hex"),
    historyMessages: call.input.length, sources: call.sources,
  })) };
}
for (const scenario of scenarios) {
  const session = createEvaluationConversation(core, fixture, scenario, complete);
  const scenarioReport = { id: scenario.id, reviewCriterion: scenario.review, semanticReview: "pending", turns: [] };
  report.scenarios.push(scenarioReport);
  let previousVersion = 0;
  for (const fixtureTurn of scenario.turns) {
    const result = await session.turn(fixtureTurn);
    const checks = checkTurn(result, fixtureTurn.expect ?? {}, !live, previousVersion);
    previousVersion = result.promptVersion;
    scenarioReport.turns.push({ ...evidenceForTurn(result), checks });
    const failures = checks.filter((check) => check.status === "failed");
    console.log(`${scenario.id} / turno ${scenarioReport.turns.length}: ${failures.length ? "REVISAR " + failures.map((check) => check.name).join(", ") : "controles técnicos sin fallo"}`);
    if (providerFailed) break;
  }
  if (providerFailed) break;
}
report.finishedAt = new Date().toISOString();
const checks = report.scenarios.flatMap((scenario) => scenario.turns.flatMap((turn) => turn.checks));
report.summary = {
  scenarios: report.scenarios.length, turns: report.scenarios.reduce((sum, scenario) => sum + scenario.turns.length, 0),
  passed: checks.filter((check) => check.status === "passed").length,
  failed: checks.filter((check) => check.status === "failed").length,
  notEvaluated: checks.filter((check) => check.status === "not_evaluated_dry_run").length,
  providerFailed, eligibleForSemanticReview: live && !providerFailed,
  releaseApproved: false,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
console.log(`Evidencia ficticia: ${relative(root, output)}. ${report.summary.failed} controles fallidos. Revisión semántica pendiente.`);
if (!live) console.log("DRY RUN: no se llamó a un modelo real; estos resultados no aprueban personalidad ni calidad.");
process.exitCode = report.summary.failed || providerFailed ? 1 : 0;
