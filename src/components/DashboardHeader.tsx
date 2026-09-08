"use client";

import { useState } from "react";
import type { ConnectionInfo } from "@/components/types";

interface DashboardHeaderProps {
  info: ConnectionInfo;
  onTestConnection: () => Promise<void>;
}

export function DashboardHeader({ info, onTestConnection }: DashboardHeaderProps) {
  const [testing, setTesting] = useState(false);

  async function testConnection() {
    setTesting(true);
    try {
      await onTestConnection();
    } finally {
      setTesting(false);
    }
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-lg font-black text-white">W</div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-slate-950">Agente de WhatsApp</h1>
          <p className="truncate text-xs text-slate-500">
            {info.phone} · {info.verifiedName || "Número verificado"}
            {info.quality ? ` · Calidad: ${info.quality}` : ""}
          </p>
          {info.webhookStatus === "unreachable" && (
            <p className="mt-1 text-xs font-medium text-amber-700" role="status">⚠ El webhook público no responde; los mensajes entrantes no llegarán.</p>
          )}
          {info.webhookStatus === "not_configured" && (
            <p className="mt-1 text-xs font-medium text-amber-700" role="status">⚠ Falta configurar una URL HTTPS pública para recibir mensajes.</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={testConnection}
        disabled={testing}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
      >
        {testing ? "Probando…" : "Probar conexión"}
      </button>
    </header>
  );
}
