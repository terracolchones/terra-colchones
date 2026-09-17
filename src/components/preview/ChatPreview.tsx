"use client";

import { useEffect, useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { createChatFixture } from "@/components/preview/chat-fixture";

export function ChatPreview() {
  const [fixture] = useState(createChatFixture);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [status, setStatus] = useState("Sube en el chat y simula un mensaje para comprobar que conservas tu posición.");
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
      if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) return fixture.request(url, init);
      if (url.origin === window.location.origin && url.pathname.startsWith("/_next/")) return originalFetch(input, init);
      return Response.json({ error: "Vista local sin conexión a servicios" }, { status: 403 });
    };
    const readyTimer = window.setTimeout(() => setReady(true), 0);
    const counter = window.setInterval(() => setPolls(fixture.count()), 500);
    return () => { window.fetch = originalFetch; window.clearTimeout(readyTimer); window.clearInterval(counter); fixture.dispose(); };
  }, [fixture]);

  const controls = <>
    <button type="button" onClick={() => { fixture.append(); setStatus("Mensaje simulado. Aparecerá en la siguiente actualización, sin interrumpir la lectura."); }}>Simular mensaje</button>
    <button type="button" onClick={() => { fixture.append(75); setStatus("Llegaron 75 mensajes de prueba. La actualización debe recuperar todos."); }}>Simular 75 mensajes</button>
    <button type="button" onClick={() => { const value = fixture.toggleOffline(); setOffline(value); setStatus(value ? "Fallo de conexión simulado. El historial cargado permanece visible." : "Conexión simulada restablecida."); }}>{offline ? "Restablecer conexión" : "Simular fallo"}</button>
    <button type="button" onClick={() => { fixture.delayNext(); setStatus("La siguiente consulta tardará más. Puedes cambiar de conversación durante la espera."); }}>Simular demora</button>
  </>;

  return <div className="chat-preview-shell flex h-dvh min-h-0 flex-col overflow-hidden"
    onClickCapture={(event) => {
      const link = (event.target as HTMLElement).closest("a");
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      setStatus(link.href.includes("wa.me") ? "Acceso comprobado: el botón abriría este contacto en tu WhatsApp. En la demo no se abren contactos ficticios." : "Este acceso se conserva en el panel real. La demostración solo habilita el chat.");
    }}>
    <style>{".chat-preview-shell > main { height: auto; flex: 1; min-height: 0; }"}</style>
    <div className="shrink-0 border-b border-emerald-200 bg-[#e4f3eb] px-4 py-3 text-[#174936]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><strong className="text-sm">Vista local · Datos ficticios</strong><span className="ml-3 hidden text-xs sm:inline" data-testid="preview-polls">{polls} consultas de mensajes</span></div>
        <div className="hidden flex-wrap gap-2 text-xs sm:flex [&>button]:rounded-lg [&>button]:border [&>button]:border-emerald-200 [&>button]:bg-white [&>button]:px-3 [&>button]:py-2">{controls}</div>
      </div>
      <p role="status" className="mt-2 hidden text-xs sm:block">{status}</p>
      <details className="mt-1 text-xs sm:hidden"><summary className="cursor-pointer py-1">Herramientas de prueba</summary><div className="mt-2 flex flex-wrap gap-2 [&>button]:rounded-lg [&>button]:border [&>button]:border-emerald-200 [&>button]:bg-white [&>button]:px-3 [&>button]:py-2">{controls}</div><p role="status" className="mt-2">{status}</p></details>
    </div>
    {ready ? <Dashboard info={{ phone: "Cuenta de demostración", verifiedName: "Terra", quality: "", webhookStatus: "reachable" }} onTestConnection={async () => { setStatus("La vista funciona con datos ficticios y no se conecta a Meta, OpenAI ni Shopify."); }} /> : <p className="p-6">Preparando vista local…</p>}
  </div>;
}
