"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfigScreen } from "@/components/ConfigScreen";
import { Dashboard } from "@/components/Dashboard";
import type { ConnectionStatus } from "@/components/types";

export function ConnectionGate() {
  const [status, setStatus] = useState<ConnectionStatus>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/connection/status", { cache: "no-store" });
      const data = (await response.json()) as Exclude<ConnectionStatus, { status: "loading" }>;
      setStatus(data);
    } catch (reason) {
      setStatus({
        status: "error",
        message: reason instanceof Error ? reason.message : "No se pudo consultar la configuración",
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (status.status === "connected") return;
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [refresh, status.status]);

  if (status.status === "loading") {
    return <main className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-300">Comprobando configuración…</main>;
  }

  if (status.status === "connected") {
    return <Dashboard info={status} onTestConnection={refresh} />;
  }

  return <ConfigScreen status={status} onRetry={refresh} />;
}
