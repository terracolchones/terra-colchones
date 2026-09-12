"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MAX_BEHAVIOR_INSTRUCTIONS_LENGTH, type BehaviorSnapshot, type BehaviorVersion } from "@/lib/behavior/types";
import { ADVISOR_NOTICE, PROTECTED_INSTRUCTIONS } from "@/lib/behavior/instructions";

type TestStage = "orientation" | "awaiting_location" | "awaiting_payment" | "payment_proof_received";

interface TestResult {
  replies: string[];
  route: string;
  modelCalled: boolean;
  sources: { label: string; kind: string }[];
  effectiveInstructions: string;
  notes: string[];
}

interface CompletedTest {
  result: TestResult;
  instructions: string;
  message: string;
  stage: TestStage;
}

const STAGES: { value: TestStage; label: string }[] = [
  { value: "orientation", label: "Consulta inicial · orientación" },
  { value: "awaiting_location", label: "Pedido confirmado · falta ubicación" },
  { value: "awaiting_payment", label: "Pedido confirmado · falta comprobante" },
  { value: "payment_proof_received", label: "Comprobante en revisión" },
];

const EXAMPLES = ["Hola", "Gracias", "¿Qué garantía tiene?", "¿Cómo puedo pagar?", "Quiero un asesor", "No quiero un asesor"];
const FIELD_CLASS = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50";
const SECONDARY_BUTTON = "rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY_BUTTON = "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || data === null) {
    throw new RequestError(
      response.status === 401 || response.status === 403
        ? "Tu sesión no permite esta acción. Vuelve a iniciar sesión en el panel."
        : data?.error || "No se pudo completar la solicitud. Inténtalo de nuevo.",
      response.status,
    );
  }
  return data;
}

function versionLabel(version: BehaviorVersion): string {
  return version.id === 0 ? "Instrucciones iniciales" : `Versión ${version.id}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("es-BO", { dateStyle: "medium", timeStyle: "short" });
}

export function BehaviorManager() {
  const [snapshot, setSnapshot] = useState<BehaviorSnapshot | null>(null);
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "publish" | "restore" | "test" | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [conflicted, setConflicted] = useState(false);
  const [restoreId, setRestoreId] = useState<number | null>(null);
  const [stage, setStage] = useState<TestStage>("orientation");
  const [testMessage, setTestMessage] = useState("Hola");
  const [completedTest, setCompletedTest] = useState<CompletedTest | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const savedInstructions = snapshot?.draft?.instructions ?? snapshot?.active.instructions ?? "";
  const dirty = snapshot !== null && instructions !== savedInstructions;
  const disabled = loading || busy !== null;
  const selectedRestore = snapshot?.versions.find((version) => version.id === restoreId);
  const testIsStale = completedTest !== null && (
    completedTest.instructions !== instructions || completedTest.message !== testMessage.trim() || completedTest.stage !== stage
  );

  const load = useCallback(async (preserveEdits = false) => {
    setLoading(true);
    try {
      const next = await request<BehaviorSnapshot>("/api/behavior");
      setSnapshot(next);
      if (!preserveEdits) setInstructions(next.draft?.instructions ?? next.active.instructions);
      setConflicted(false);
      setRestoreId(null);
      setNotice(preserveEdits ? {
        text: "Cargamos la versión más reciente y conservamos tu texto. Revisa las instrucciones activas y el borrador guardado antes de guardar tus cambios.",
        error: false,
      } : null);
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "No se pudieron cargar las instrucciones.", error: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  async function mutate(action: "save" | "publish" | "restore") {
    if (!snapshot || disabled || conflicted) return;
    if (action === "publish" && (dirty || !snapshot.draft)) return;
    if (action === "restore" && (dirty || !selectedRestore)) return;
    setBusy(action);
    setNotice(null);
    try {
      const next = await request<BehaviorSnapshot>(action === "save" ? "/api/behavior" : `/api/behavior/${action}`, {
        method: action === "save" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: snapshot.revision,
          ...(action === "save" ? { instructions } : {}),
          ...(action === "restore" ? { versionId: restoreId } : {}),
        }),
      });
      setSnapshot(next);
      setInstructions(next.draft?.instructions ?? next.active.instructions);
      setRestoreId(null);
      setNotice({
        error: false,
        text: action === "save"
          ? "Borrador guardado. Las instrucciones activas siguen atendiendo al agente."
          : action === "publish"
            ? `${versionLabel(next.active)} publicada. Se utilizará en las siguientes respuestas que consulten al modelo.`
            : `${versionLabel(next.active)} publicada a partir de la versión elegida. ${next.draft ? "Tu borrador se conserva." : "El historial anterior se conserva."}`,
      });
    } catch (error) {
      const conflict = error instanceof RequestError && error.status === 409;
      if (conflict) setConflicted(true);
      setNotice({
        error: true,
        text: conflict
          ? "Las instrucciones cambiaron en otra sesión. Tu texto se conserva; carga los cambios recientes para revisarlos antes de guardar o publicar."
          : error instanceof Error ? error.message : "No se pudo guardar el cambio.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function runTest() {
    if (disabled || !instructions.trim() || !testMessage.trim()) return;
    setBusy("test");
    setTestError(null);
    setCompletedTest(null);
    try {
      const message = testMessage.trim();
      const result = await request<TestResult>("/api/behavior/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions, stage, message }),
      });
      setCompletedTest({ result, instructions, message, stage });
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "No se pudo ejecutar la prueba.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-7">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/" className="text-sm font-medium text-emerald-700 hover:underline">← Volver al agente</Link>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">Comportamiento del agente</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Define cómo conversa Terra. Guarda tus cambios como borrador, pruébalos y publica cuando estén listos.</p>
          </div>
          <Link href="/conocimiento" className={SECONDARY_BUTTON}>Base de conocimiento</Link>
        </header>

        {notice && (
          <div role={notice.error ? "alert" : "status"} className={`mb-4 rounded-xl border px-4 py-3 text-sm leading-6 ${notice.error ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
            <p>{notice.text}</p>
            {(conflicted || !snapshot) && <button type="button" onClick={() => void load(snapshot !== null)} disabled={disabled} className="mt-2 font-semibold underline underline-offset-4 disabled:opacity-50">{conflicted ? "Cargar cambios recientes conservando mi texto" : "Volver a intentar"}</button>}
          </div>
        )}

        {loading && !snapshot ? <p role="status" className="rounded-xl bg-white p-6 text-sm text-slate-600">Cargando instrucciones…</p> : snapshot && (
          <>
            <section aria-label="Instrucciones activas" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">ACTIVA</span>
                  <h2 className="text-sm font-semibold text-emerald-950">{versionLabel(snapshot.active)}</h2>
                  {snapshot.active.id !== 0 && <span className="text-xs text-emerald-800">{formatDate(snapshot.active.createdAt)}</span>}
                </div>
                <p className="text-xs text-emerald-800">El borrador no cambia la atención actual.</p>
              </div>
              <details className="mt-3 text-sm text-emerald-950">
                <summary className="cursor-pointer font-medium">Ver instrucciones activas</summary>
                <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-white p-4 font-sans text-sm leading-6 text-slate-800">{snapshot.active.instructions}</pre>
              </details>
            </section>

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
              <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="editor-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="editor-heading" className="text-lg font-bold text-slate-900">Instrucciones · System Prompt</h2>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${dirty ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                    {dirty ? "Cambios sin guardar" : snapshot.draft ? "Borrador guardado" : "Sin cambios"}
                  </span>
                </div>
                <p id="instructions-help" className="mt-2 text-sm leading-6 text-slate-500">Edita la identidad, el tono y la forma de atender. Orienta a quien está eligiendo y acompaña la compra de quien ya confirmó su pedido.</p>
                <label htmlFor="behavior-instructions" className="mt-4 block text-sm font-semibold text-slate-700">Tu borrador</label>
                <textarea id="behavior-instructions" aria-describedby="instructions-help instructions-limit" value={instructions} onChange={(event) => setInstructions(event.target.value)} disabled={disabled} maxLength={MAX_BEHAVIOR_INSTRUCTIONS_LENGTH} rows={19} spellCheck className={`mt-2 w-full resize-y leading-6 ${FIELD_CLASS}`} />
                <p id="instructions-limit" className="mt-1 text-right text-xs text-slate-500">{instructions.length.toLocaleString("es-BO")} / {MAX_BEHAVIOR_INSTRUCTIONS_LENGTH.toLocaleString("es-BO")} caracteres</p>
                <p className="mt-3 text-sm leading-6 text-slate-500">Las políticas del negocio van en <Link href="/conocimiento" className="font-medium text-emerald-700 hover:underline">Base de conocimiento</Link>. Los precios y las variantes se consultan en el catálogo.</p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void mutate("save")} disabled={disabled || conflicted || !dirty || !instructions.trim()} className={SECONDARY_BUTTON}>{busy === "save" ? "Guardando…" : "Guardar borrador"}</button>
                  <button type="button" onClick={() => void mutate("publish")} disabled={disabled || conflicted || dirty || !snapshot.draft} className={PRIMARY_BUTTON}>{busy === "publish" ? "Publicando…" : "Publicar borrador"}</button>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">Publicar activa el borrador guardado para las siguientes respuestas. Primero guarda cualquier cambio pendiente.</p>
                {dirty && snapshot.draft && (
                  <details className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
                    <summary className="cursor-pointer font-medium">Comparar con el borrador guardado</summary>
                    <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-sm leading-6">{snapshot.draft.instructions}</pre>
                  </details>
                )}
              </section>

              <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="test-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="test-heading" className="text-lg font-bold text-slate-900">Probar una conversación</h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Modelo simulado</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">Usa ejemplos ficticios. Esta prueba comprueba el recorrido y las instrucciones con datos de ejemplo, sin enviar WhatsApp ni consultar servicios externos.</p>
                <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void runTest(); }}>
                  <label className="grid gap-2 text-sm font-semibold text-slate-700">Situación del cliente
                    <select value={stage} onChange={(event) => setStage(event.target.value as TestStage)} disabled={disabled} className={FIELD_CLASS}>
                      {STAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="mt-4 grid gap-2 text-sm font-semibold text-slate-700">Mensaje ficticio del cliente
                    <textarea value={testMessage} onChange={(event) => setTestMessage(event.target.value)} disabled={disabled} maxLength={1000} rows={3} className={`resize-y font-normal ${FIELD_CLASS}`} />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2" aria-label="Ejemplos de mensajes">
                    {EXAMPLES.map((example) => <button key={example} type="button" onClick={() => setTestMessage(example)} disabled={disabled} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50">{example}</button>)}
                  </div>
                  <button type="submit" disabled={disabled || !instructions.trim() || !testMessage.trim()} className={`mt-4 ${SECONDARY_BUTTON}`}>{busy === "test" ? "Probando…" : "Probar texto del editor"}</button>
                  <p className="mt-2 text-xs leading-5 text-slate-500">Puedes probar sin guardar. El modelo simulado no evalúa la calidad del tono que produciría la IA real.</p>
                </form>
                {testError && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{testError}</p>}
                {completedTest && (
                  <div className="mt-5 border-t border-slate-200 pt-4" aria-live="polite">
                    {testIsStale && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Este resultado corresponde a una prueba anterior. Vuelve a probar para incluir tus cambios.</p>}
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Resultado de la prueba</p>
                    <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700"><span className="mb-1 block text-xs font-semibold text-slate-500">Cliente ficticio</span>{completedTest.message}</p>
                    {completedTest.result.replies.length === 0 ? <p className="mt-3 text-sm text-slate-600">Este caso no produjo una respuesta automática.</p> : completedTest.result.replies.map((reply, index) => (
                      <p key={index} className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-950"><span className="mb-1 block text-xs font-semibold text-emerald-700">Terra · {completedTest.result.modelCalled ? "respuesta simulada" : "mensaje automático"}</span>{reply}</p>
                    ))}
                    <details className="mt-4 text-sm text-slate-600">
                      <summary className="cursor-pointer font-medium">Ver cómo se obtuvo este resultado</summary>
                      <dl className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5">
                        <div><dt className="font-semibold">Recorrido</dt><dd className="break-words">{completedTest.result.route}</dd></div>
                        <div><dt className="font-semibold">Generación</dt><dd>{completedTest.result.modelCalled ? "Se utilizó el modelo simulado." : "Respondió una regla del sistema, sin utilizar el modelo."}</dd></div>
                        <div><dt className="font-semibold">Fuentes entregadas al modelo simulado</dt><dd>{completedTest.result.sources.length > 0 ? <ul className="mt-1 list-inside list-disc">{completedTest.result.sources.map((source, index) => <li key={`${source.kind}-${index}`}>{source.label} · {source.kind}</li>)}</ul> : "No se entregaron fuentes en este caso."}</dd></div>
                      </dl>
                      {completedTest.result.notes.length > 0 && <ul className="mt-3 list-inside list-disc space-y-1 text-xs leading-5">{completedTest.result.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
                      <h3 className="mt-4 text-xs font-semibold">{completedTest.result.modelCalled ? "Instrucciones entregadas al modelo simulado" : "Vista de instrucciones · el modelo no fue llamado"}</h3>
                      <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-xs leading-5">{completedTest.result.effectiveInstructions || "Este recorrido respondió sin consultar al modelo."}</pre>
                    </details>
                  </div>
                )}
              </section>
            </div>

            <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="protected-heading">
              <h2 id="protected-heading" className="text-base font-bold text-slate-900">Reglas que se mantienen protegidas</h2>
              <p className="mt-2 text-sm text-slate-500">Las instrucciones editables no cambian estos controles del sistema.</p>
              <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-700 md:grid-cols-2">
                <p className="rounded-lg bg-slate-50 p-3"><span className="block font-semibold">Acceso a atención humana</span>{ADVISOR_NOTICE}</p>
                <p className="rounded-lg bg-slate-50 p-3"><span className="block font-semibold">Control del equipo</span>El modo IA/HUMANO define quién atiende. Se respeta la solicitud explícita de asesor y el interruptor manual.</p>
                <p className="rounded-lg bg-slate-50 p-3"><span className="block font-semibold">Pedido y pago</span>Se conserva la asociación del pedido, GPS y QR. El pago y el comprobante nunca se aprueban automáticamente.</p>
                <p className="rounded-lg bg-slate-50 p-3"><span className="block font-semibold">Envíos</span>Se evitan duplicados. Un resultado de envío incierto requiere revisión antes de cualquier reintento.</p>
              </div>
              <details className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
                <summary className="cursor-pointer font-medium">Ver instrucciones protegidas que recibe el modelo</summary>
                <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-sm leading-6">{PROTECTED_INSTRUCTIONS}</pre>
              </details>
            </section>

            <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="history-heading">
              <h2 id="history-heading" className="text-base font-bold text-slate-900">Historial de publicaciones</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Puedes recuperar instrucciones anteriores publicándolas como una versión nueva. El borrador guardado se conserva.</p>
              <div className="mt-4 divide-y divide-slate-100">
                {snapshot.versions.map((version) => (
                  <details key={version.id} className="py-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      {versionLabel(version)}{version.id === snapshot.active.id ? " · Activa" : ""}
                      {version.id !== 0 && <span className="ml-2 text-xs font-normal text-slate-500">{formatDate(version.createdAt)}</span>}
                      {version.restoredFrom !== undefined && <span className="ml-2 text-xs font-normal text-slate-500">Recuperada de {version.restoredFrom === 0 ? "las instrucciones iniciales" : `la versión ${version.restoredFrom}`}</span>}
                    </summary>
                    <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-sm leading-6 text-slate-700">{version.instructions}</pre>
                    {version.id !== snapshot.active.id && <button type="button" onClick={() => setRestoreId(version.id)} disabled={disabled || dirty || conflicted} className={`mt-3 ${SECONDARY_BUTTON}`}>Elegir para restaurar</button>}
                    {selectedRestore?.id === version.id && (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm leading-6 text-amber-950">Vas a activar de nuevo <strong>{versionLabel(selectedRestore).toLowerCase()}</strong>. Esta acción crea una publicación nueva y conserva tu borrador guardado.</p>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <button type="button" onClick={() => void mutate("restore")} disabled={disabled || dirty || conflicted} className={PRIMARY_BUTTON}>{busy === "restore" ? "Restaurando…" : "Publicar esta versión de nuevo"}</button>
                          <button type="button" onClick={() => setRestoreId(null)} disabled={disabled} className={SECONDARY_BUTTON}>Cancelar</button>
                        </div>
                      </div>
                    )}
                  </details>
                ))}
              </div>
              {dirty && <p className="mt-2 text-xs text-slate-500">Guarda tus cambios antes de restaurar una versión.</p>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
