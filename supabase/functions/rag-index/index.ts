// @ts-nocheck -- ejecutado por Deno/Supabase, no por el compilador de Next.js.
import { createClient } from "npm:@supabase/supabase-js@2";

interface Job {
  job_id: number;
  chunk_id: string;
  content: string;
}

function authorized(request: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return Boolean(serviceKey && request.headers.get("authorization") === `Bearer ${serviceKey}`);
}

function embeddingFrom(result: unknown): number[] | null {
  if (!Array.isArray(result)) return null;
  const vector = Array.isArray(result[0]) ? result[0] : result;
  return vector.every((value) => typeof value === "number" && Number.isFinite(value)) ? vector as number[] : null;
}

/** Worker interno idempotente; se programa cada minuto desde Supabase. */
Deno.serve(async (request) => {
  if (request.method !== "POST" || !authorized(request)) return new Response("No autorizado", { status: 401 });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return Response.json({ error: "Falta configuración interna." }, { status: 500 });
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const { data, error } = await client.rpc("claim_terra_rag_embedding_jobs", { p_limit: 20 });
    if (error) throw error;
    const jobs = (data ?? []) as Job[];
    if (jobs.length === 0) return Response.json({ processed: 0 });

    const model = new Supabase.ai.Session("gte-small");
    const embeddings = await model.run(jobs.map((job) => job.content), { mean_pool: true, normalize: true });
    const vectors = Array.isArray(embeddings) && Array.isArray(embeddings[0]) ? embeddings : [embeddings];
    await Promise.all(jobs.map(async (job, index) => {
      const vector = embeddingFrom(vectors[index]);
      if (!vector || vector.length !== 384) {
        await client.from("rag_embedding_jobs").update({ status: "failed", last_error: "Embedding inválido" }).eq("id", job.job_id);
        return;
      }
      const { error: chunkError } = await client.from("rag_chunks").update({ embedding: vector, embedding_status: "ready" }).eq("id", job.chunk_id);
      if (chunkError) throw chunkError;
      const { error: jobError } = await client.from("rag_embedding_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.job_id);
      if (jobError) throw jobError;
    }));
    return Response.json({ processed: jobs.length });
  } catch (error) {
    console.error("[rag-index]", error instanceof Error ? error.message : error);
    return Response.json({ error: "No se pudo procesar la cola." }, { status: 500 });
  }
});
