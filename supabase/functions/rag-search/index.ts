// @ts-nocheck -- ejecutado por Deno/Supabase, no por el compilador de Next.js.
import { createClient } from "npm:@supabase/supabase-js@2";

type SearchRow = Record<string, unknown>;

function authorized(request: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return Boolean(serviceKey && request.headers.get("authorization") === `Bearer ${serviceKey}`);
}

function embeddingFrom(result: unknown): number[] | null {
  const vector = Array.isArray(result)
    ? result
    : ArrayBuffer.isView(result)
      ? Array.from(result)
      : [];
  return vector.length === 384 && vector.every((value) => typeof value === "number" && Number.isFinite(value))
    ? vector as number[]
    : null;
}

/** Búsqueda semántica interna. Nunca se expone al navegador ni a WhatsApp. */
Deno.serve(async (request) => {
  if (request.method !== "POST" || !authorized(request)) return new Response("No autorizado", { status: 401 });
  try {
    const body = await request.json() as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query || query.length > 600) return Response.json({ error: "Consulta inválida." }, { status: 400 });

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Falta configuración interna de Supabase.");
    const model = new Supabase.ai.Session("gte-small");
    const vector = embeddingFrom(await model.run(query, { mean_pool: true, normalize: true }));
    if (!vector || vector.length !== 384) throw new Error("El modelo no devolvió un embedding válido.");

    const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await client.rpc("match_terra_rag_chunks", {
      query_text: query,
      query_embedding: vector,
      match_count: 8,
    });
    if (error) throw error;
    return Response.json({ results: (data ?? []) as SearchRow[] });
  } catch (error) {
    console.error("[rag-search]", error instanceof Error ? error.message : error);
    return Response.json({ error: "No se pudo completar la búsqueda." }, { status: 500 });
  }
});
