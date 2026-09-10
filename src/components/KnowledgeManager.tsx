"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KNOWLEDGE_KINDS, type KnowledgeDocumentSummary, type KnowledgeKind } from "@/lib/rag/knowledge-types";

interface FormState {
  title: string;
  kind: KnowledgeKind;
  tags: string;
  content: string;
}

const EMPTY_FORM: FormState = { title: "", kind: "company", tags: "", content: "" };

const KIND_LABEL: Record<KnowledgeKind, string> = {
  company: "Empresa",
  delivery: "Entrega",
  policy: "Política",
  faq: "Pregunta frecuente",
  product_supplement: "Ficha complementaria",
  category: "Categoría",
};

function toForm(document: KnowledgeDocumentSummary | null): FormState {
  if (!document) return EMPTY_FORM;
  return {
    title: document.title,
    kind: document.kind,
    tags: document.tags.join(", "),
    content: document.currentVersion?.content ?? "",
  };
}

function labelStatus(document: KnowledgeDocumentSummary): string {
  const status = document.currentVersion?.status;
  if (status === "draft") return "Borrador";
  if (status === "published") return "Publicado";
  return "Sin versión activa";
}

export function KnowledgeManager() {
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => documents.find((document) => document.id === selectedId) ?? null,
    [documents, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/knowledge", { cache: "no-store" });
      const data = await response.json() as { documents?: KnowledgeDocumentSummary[]; error?: string };
      if (!response.ok || !data.documents) throw new Error(data.error || "No se pudo cargar la base de conocimiento.");
      setDocuments(data.documents);
      setSelectedId((current) => current && data.documents!.some((document) => document.id === current) ? current : null);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar la base de conocimiento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function selectDocument(document: KnowledgeDocumentSummary) {
    setSelectedId(document.id);
    setForm(toForm(document));
    setMessage(null);
  }

  function newDocument() {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    try {
      const body = {
        title: form.title,
        kind: form.kind,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        content: form.content,
        catalogProductId: null,
        catalogCategory: null,
      };
      const response = await fetch(selected ? `/api/knowledge/${selected.id}` : "/api/knowledge", {
        method: selected ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json() as { document?: KnowledgeDocumentSummary; error?: string };
      if (!response.ok || !data.document) throw new Error(data.error || "No se pudo guardar el borrador.");
      setSelectedId(data.document.id);
      setForm(toForm(data.document));
      await load();
      setMessage("Borrador guardado. Solo se usará cuando lo publiques.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el borrador.");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/knowledge/${selected.id}/publish`, { method: "POST" });
      const data = await response.json() as { document?: KnowledgeDocumentSummary; error?: string };
      if (!response.ok || !data.document) throw new Error(data.error || "No se pudo publicar.");
      await load();
      setMessage("Publicado. El agente podrá usar esta información; la indexación semántica se completa en segundo plano.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo publicar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-7">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/" className="text-sm font-medium text-emerald-700 hover:underline">← Volver al agente</Link>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">Base de conocimiento</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">Información aprobada que el agente usa para responder dudas sin interrumpir el flujo de venta.</p>
          </div>
          <button type="button" onClick={newDocument} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            + Nuevo contenido
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Documentos</p>
            {loading ? <p className="p-2 text-sm text-slate-500">Cargando…</p> : documents.length === 0 ? <p className="p-2 text-sm text-slate-500">Aún no hay contenido publicado desde este panel.</p> : (
              <div className="space-y-1">
                {documents.map((document) => (
                  <button key={document.id} type="button" onClick={() => selectDocument(document)} className={`w-full rounded-lg px-3 py-2 text-left transition ${selectedId === document.id ? "bg-emerald-50 text-emerald-950" : "hover:bg-slate-50"}`}>
                    <span className="block truncate text-sm font-semibold">{document.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">{KIND_LABEL[document.kind]} · {labelStatus(document)}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{selected ? "Editar conocimiento" : "Nuevo conocimiento"}</h2>
                <p className="mt-1 text-sm text-slate-500">Guarda primero como borrador; publicar es la acción que lo pone a disposición del agente.</p>
              </div>
              {selected && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{labelStatus(selected)}</span>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">Título
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={140} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-600" placeholder="Ej.: Entregas y cobertura" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">Tipo
                <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as KnowledgeKind })} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-600">
                  {KNOWLEDGE_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-4 grid gap-1 text-sm font-medium text-slate-700">Etiquetas (separadas por coma)
              <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-600" placeholder="entrega, Santa Cruz, Bolivia" />
            </label>
            <label className="mt-4 grid gap-1 text-sm font-medium text-slate-700">Contenido aprobado
              <textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} maxLength={15000} rows={16} className="resize-y rounded-lg border border-slate-300 px-3 py-2 leading-6 outline-none focus:border-emerald-600" placeholder="Escribe la información que Terra autoriza que el agente comunique." />
            </label>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">Guardar borrador</button>
              {selected && <button type="button" onClick={() => void publish()} disabled={saving || selected.currentVersion?.status !== "draft"} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">Publicar</button>}
              {message && <p role="status" className="text-sm text-slate-600">{message}</p>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
