"use client";

import { useEffect, useState } from "react";
import type { ConnectionStatus } from "@/components/types";

interface ConfigScreenProps {
  status: Extract<ConnectionStatus, { status: "missing_config" | "token_expired" | "error" }>;
  onRetry: () => Promise<void>;
}

const REQUIRED = [
  "META_ACCESS_TOKEN",
  "META_PHONE_NUMBER_ID",
  "META_APP_SECRET",
  "META_VERIFY_TOKEN",
  "OPENAI_API_KEY",
];

export function ConfigScreen({ status, onRetry }: ConfigScreenProps) {
  const [origin, setOrigin] = useState("https://TU_DOMINIO");
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setOrigin(window.location.origin));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function retry() {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  const missing = status.status === "missing_config" ? status.missing : [];
  const webhookVerifyToken = missing.includes("META_VERIFY_TOKEN")
    ? "Define META_VERIFY_TOKEN en .env.local"
    : "Configurado en .env.local (no se muestra por seguridad)";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-xl bg-emerald-500 text-xl font-black text-slate-950">W</div>
          <div>
            <h1 className="text-2xl font-bold">Configura tu API de WhatsApp</h1>
            <p className="mt-1 text-sm text-slate-400">Conexión oficial de Meta Cloud API + OpenAI.</p>
          </div>
        </div>

        {status.status === "token_expired" && (
          <div className="mb-6 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-bold">El token de acceso de Meta venció.</p>
            <p className="mt-1">Genera un nuevo System User Token en Meta y reemplaza solamente <code>META_ACCESS_TOKEN</code> en <code>.env.local</code>. Después pulsa “Revisar configuración”.</p>
          </div>
        )}

        {status.status === "error" && (
          <div className="mb-6 rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">
            <span className="font-bold">No se pudo validar Graph API:</span> {status.message}
          </div>
        )}

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-7">
          <h2 className="text-lg font-bold">Variables de entorno</h2>
          <p className="mt-1 text-sm text-slate-400">Crea o completa <code>.env.local</code> a partir de <code>.env.example</code>.</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {REQUIRED.map((variable) => {
              const isMissing = missing.includes(variable);
              return (
                <li key={variable} className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 font-mono text-xs">
                  <span className={isMissing ? "text-red-400" : "text-emerald-400"}>{isMissing ? "✗" : "✓"}</span>
                  <span>{variable}</span>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm">
            <p className="mb-2 font-semibold text-slate-200">Configuración del webhook</p>
            <code className="block break-all text-emerald-300">{origin}/api/webhook</code>
            <code className="mt-2 block break-all text-amber-300">VERIFY_TOKEN: {webhookVerifyToken}</code>
          </div>

          <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-300">
            <li>Entra a <a className="text-emerald-300 underline" href="https://developers.facebook.com/" target="_blank" rel="noreferrer">Meta for Developers</a> y crea una app.</li>
            <li>Agrega el producto WhatsApp y copia Phone Number ID, WABA ID y App Secret.</li>
            <li>Genera un System User Token permanente y guárdalo como <code>META_ACCESS_TOKEN</code>. Si el aviso indica que venció, reemplaza el token actual por el nuevo.</li>
            <li>Configura la URL y el VERIFY_TOKEN de arriba; suscribe el campo <code>messages</code>.</li>
            <li>Crea una clave de API de OpenAI y guárdala como <code>OPENAI_API_KEY</code>.</li>
          </ol>

          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            className="mt-7 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
          >
            {retrying ? "Comprobando…" : "Revisar configuración"}
          </button>
        </section>
      </div>
    </main>
  );
}
