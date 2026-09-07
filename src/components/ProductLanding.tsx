"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Compatibilidad para enlaces antiguos. El checkout actual vive en los botones
 * nativos de WhatsApp; esta vista solo redirige a la landing heredada.
 */
export function ProductLanding() {
  const params = useSearchParams();
  const orderId = useMemo(() => params.get("order")?.trim() ?? "", [params]);
  const destination = useMemo(
    () => `/landing.html${orderId ? `?order=${encodeURIComponent(orderId)}` : ""}`,
    [orderId],
  );

  useEffect(() => {
    window.location.replace(destination);
  }, [destination]);

  return <main className="grid min-h-dvh place-items-center bg-stone-950 px-6 text-center text-sm text-white">Cargando oferta…</main>;
}
