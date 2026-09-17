"use client";

import Link from "next/link";
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

  const settings = <>
    <Link href="/comportamiento" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Comportamiento</Link>
    <Link href="/conocimiento" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Base de conocimiento</Link>
    <button type="button" onClick={testConnection} disabled={testing} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
      {testing ? "Probando…" : "Probar conexión"}
    </button>
  </>;

  return (
    <header className="terra-dashboard-header flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#006b57] bg-[#008069] px-4 py-3 text-white sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#008069] text-lg font-bold text-white">T</div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-slate-950">Terra <span className="font-normal text-slate-500">/ WhatsApp</span></h1>
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
      <div className="hidden flex-wrap items-center gap-2 sm:flex">{settings}</div>
      <details className="relative sm:hidden">
        <summary className="cursor-pointer rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-700">Ajustes</summary>
        <div className="absolute right-0 top-full z-20 mt-2 flex w-56 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">{settings}</div>
      </details>
    </header>
  );
}
