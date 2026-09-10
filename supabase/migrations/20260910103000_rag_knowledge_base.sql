-- Base RAG de Terra: contenido comercial aprobado, versionado e indexación.
-- Esta migración no contiene datos de clientes, conversaciones, pagos ni GPS.
-- Se aplica en el mismo proyecto Supabase que ya aloja el catálogo publicado.

create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create table if not exists public.rag_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  kind text not null check (kind in ('company', 'delivery', 'policy', 'faq', 'product_supplement', 'category')),
  tags text[] not null default '{}'::text[],
  catalog_product_id uuid references public.catalog_products(id) on delete set null,
  catalog_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rag_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.rag_documents(id) on delete cascade,
  revision integer not null check (revision > 0),
  content text not null check (char_length(content) between 1 and 15000),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (document_id, revision)
);

create unique index if not exists rag_one_published_version_per_document
  on public.rag_document_versions (document_id)
  where status = 'published';

create index if not exists rag_document_versions_document_status_idx
  on public.rag_document_versions (document_id, status, revision desc);

create table if not exists public.rag_chunks (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_kind text not null check (source_kind in ('knowledge', 'catalog')),
  document_version_id uuid references public.rag_document_versions(id) on delete cascade,
  catalog_product_id uuid references public.catalog_products(id) on delete cascade,
  chunk_index integer not null default 0 check (chunk_index >= 0),
  title text not null check (char_length(title) between 1 and 180),
  content text not null check (char_length(content) between 1 and 6000),
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  fts tsvector generated always as (to_tsvector('spanish', title || ' ' || content)) stored,
  embedding extensions.vector(384),
  embedding_status text not null default 'pending' check (embedding_status in ('pending', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_kind = 'knowledge' and document_version_id is not null and catalog_product_id is null)
    or
    (source_kind = 'catalog' and document_version_id is null and catalog_product_id is not null)
  )
);

create index if not exists rag_chunks_fts_idx on public.rag_chunks using gin (fts);
create index if not exists rag_chunks_product_idx on public.rag_chunks (catalog_product_id) where source_kind = 'catalog';
create index if not exists rag_chunks_embedding_idx
  on public.rag_chunks using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create table if not exists public.rag_embedding_jobs (
  id bigint generated always as identity primary key,
  chunk_id uuid not null unique references public.rag_chunks(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists rag_embedding_jobs_next_idx
  on public.rag_embedding_jobs (status, updated_at asc)
  where status in ('queued', 'failed');

create or replace function public.rag_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rag_documents_touch_updated_at on public.rag_documents;
create trigger rag_documents_touch_updated_at
before update on public.rag_documents
for each row execute function public.rag_touch_updated_at();

drop trigger if exists rag_document_versions_touch_updated_at on public.rag_document_versions;
create trigger rag_document_versions_touch_updated_at
before update on public.rag_document_versions
for each row execute function public.rag_touch_updated_at();

drop trigger if exists rag_chunks_touch_updated_at on public.rag_chunks;
create trigger rag_chunks_touch_updated_at
before update on public.rag_chunks
for each row execute function public.rag_touch_updated_at();

drop trigger if exists rag_embedding_jobs_touch_updated_at on public.rag_embedding_jobs;
create trigger rag_embedding_jobs_touch_updated_at
before update on public.rag_embedding_jobs
for each row execute function public.rag_touch_updated_at();

-- Publicar es una operación atómica: el borrador anterior se archiva, se
-- publica la nueva versión y se deja un trabajo de embeddings por cada bloque.
create or replace function public.publish_terra_rag_version(
  p_version_id uuid,
  p_chunks jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_document_id uuid;
  v_status text;
  v_item jsonb;
  v_index integer := 0;
  v_content text;
  v_title text;
  v_chunk_id uuid;
begin
  select document_id, status into v_document_id, v_status
  from public.rag_document_versions
  where id = p_version_id
  for update;

  if not found then
    raise exception 'La versión RAG no existe';
  end if;
  if v_status <> 'draft' then
    raise exception 'Solo se puede publicar una versión en borrador';
  end if;
  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then
    raise exception 'La publicación requiere al menos un bloque de contenido';
  end if;

  update public.rag_document_versions
  set status = 'archived'
  where document_id = v_document_id and status = 'published';

  update public.rag_document_versions
  set status = 'published', published_at = now()
  where id = p_version_id;

  for v_item in select value from jsonb_array_elements(p_chunks)
  loop
    v_content := btrim(coalesce(v_item->>'content', ''));
    v_title := left(btrim(coalesce(v_item->>'title', '')), 180);
    if char_length(v_content) = 0 or char_length(v_content) > 6000 or char_length(v_title) = 0 then
      raise exception 'Un bloque de publicación no es válido';
    end if;

    insert into public.rag_chunks (
      source_key, source_kind, document_version_id, chunk_index, title, content,
      content_hash, metadata, embedding, embedding_status
    ) values (
      'knowledge:' || p_version_id::text || ':' || v_index,
      'knowledge', p_version_id, v_index, v_title, v_content,
      encode(digest(v_title || E'\n' || v_content, 'sha256'), 'hex'),
      coalesce(v_item->'metadata', '{}'::jsonb), null, 'pending'
    ) returning id into v_chunk_id;

    insert into public.rag_embedding_jobs (chunk_id, status)
    values (v_chunk_id, 'queued')
    on conflict (chunk_id) do update
      set status = 'queued', last_error = null, completed_at = null;

    v_index := v_index + 1;
  end loop;
end;
$$;

-- Crea o actualiza una tarjeta semántica del catálogo. No copia precio ni
-- stock: esos datos siguen leyéndose en vivo desde el catálogo por el agente.
create or replace function public.rag_sync_catalog_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_product public.catalog_products%rowtype;
  v_content text;
  v_chunk_id uuid;
begin
  select * into v_product from public.catalog_products where id = p_product_id;
  if not found or not v_product.published then
    delete from public.rag_chunks where source_key = 'catalog:' || p_product_id::text;
    return;
  end if;

  select concat_ws(E'\n',
    'Producto: ' || v_product.name,
    'Categoría: ' || v_product.category,
    nullif('Descripción corta: ' || nullif(v_product.short_description, ''), 'Descripción corta: '),
    nullif('Descripción: ' || nullif(v_product.description, ''), 'Descripción: '),
    case when jsonb_array_length(v_product.specifications) > 0 then 'Especificaciones: ' || array_to_string(array(select jsonb_array_elements_text(v_product.specifications)), '; ') end,
    (
      select case when count(*) > 0 then 'Variantes activas: ' || string_agg(label, ', ' order by sort_order, label) end
      from public.catalog_variants
      where product_id = v_product.id and active = true
    )
  ) into v_content;

  insert into public.rag_chunks (
    source_key, source_kind, catalog_product_id, chunk_index, title, content,
    content_hash, metadata, embedding, embedding_status
  ) values (
    'catalog:' || v_product.id::text,
    'catalog', v_product.id, 0, v_product.name, v_content,
    encode(digest(v_content, 'sha256'), 'hex'),
    jsonb_build_object('slug', v_product.slug, 'category', v_product.category), null, 'pending'
  ) on conflict (source_key) do update set
    title = excluded.title,
    content = excluded.content,
    content_hash = excluded.content_hash,
    metadata = excluded.metadata,
    embedding = case when public.rag_chunks.content_hash is distinct from excluded.content_hash then null else public.rag_chunks.embedding end,
    embedding_status = case when public.rag_chunks.content_hash is distinct from excluded.content_hash then 'pending' else public.rag_chunks.embedding_status end
  returning id into v_chunk_id;

  insert into public.rag_embedding_jobs (chunk_id, status)
  select v_chunk_id, 'queued'
  where exists (
    select 1 from public.rag_chunks where id = v_chunk_id and embedding is null
  )
  on conflict (chunk_id) do update set
    status = case when public.rag_embedding_jobs.status = 'completed' then 'completed' else 'queued' end,
    last_error = case when public.rag_embedding_jobs.status = 'completed' then public.rag_embedding_jobs.last_error else null end;
end;
$$;

create or replace function public.rag_catalog_product_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.rag_sync_catalog_product(old.id);
    return old;
  end if;
  perform public.rag_sync_catalog_product(new.id);
  return new;
end;
$$;

create or replace function public.rag_catalog_variant_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.rag_sync_catalog_product(old.product_id);
    return old;
  end if;
  perform public.rag_sync_catalog_product(new.product_id);
  return new;
end;
$$;

drop trigger if exists rag_catalog_product_sync on public.catalog_products;
create trigger rag_catalog_product_sync
after insert or update or delete on public.catalog_products
for each row execute function public.rag_catalog_product_trigger();

drop trigger if exists rag_catalog_variant_sync on public.catalog_variants;
create trigger rag_catalog_variant_sync
after insert or update or delete on public.catalog_variants
for each row execute function public.rag_catalog_variant_trigger();

-- Conserva la base aprobada que el agente ya utilizaba antes del panel. A
-- partir de aquí se edita con borradores y publicación explícita, no en código.
insert into public.rag_documents (id, title, kind, tags)
values (
  '10000000-0000-4000-8000-000000000001',
  'Base inicial de Terra',
  'company',
  array['empresa', 'entrega', 'pagos', 'catalogo']
)
on conflict (id) do nothing;

insert into public.rag_document_versions (id, document_id, revision, content, status, published_at)
values (
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  1,
  $terra$
Importadora Terra atiende por catálogo web y WhatsApp. Comercializa colchones brasileños, somieres, almohadas, juegos de living, comedores y cocinas modulares.

Terra realiza entregas en Santa Cruz y envíos a Bolivia. La cobertura, fecha y costo exactos se confirman cuando exista una fuente aprobada o con un asesor.

La ficha publicada de cada producto es la fuente vigente para sus detalles, variantes, precio y disponibilidad. No se usan copias manuales de esos datos.

El pago se coordina únicamente mediante el flujo controlado de compra. Un comprobante queda en revisión y el agente nunca afirma que un pago está aprobado, ni solicita o modifica QR, datos bancarios, GPS o comprobantes fuera de ese flujo.
  $terra$,
  'published',
  now()
)
on conflict (id) do nothing;

insert into public.rag_chunks (
  id, source_key, source_kind, document_version_id, chunk_index, title, content,
  content_hash, metadata, embedding_status
)
values (
  '10000000-0000-4000-8000-000000000003',
  'knowledge:10000000-0000-4000-8000-000000000002:0',
  'knowledge',
  '10000000-0000-4000-8000-000000000002',
  0,
  'Base inicial de Terra',
  $terra$
Importadora Terra atiende por catálogo web y WhatsApp. Comercializa colchones brasileños, somieres, almohadas, juegos de living, comedores y cocinas modulares.

Terra realiza entregas en Santa Cruz y envíos a Bolivia. La cobertura, fecha y costo exactos se confirman cuando exista una fuente aprobada o con un asesor.

La ficha publicada de cada producto es la fuente vigente para sus detalles, variantes, precio y disponibilidad. No se usan copias manuales de esos datos.

El pago se coordina únicamente mediante el flujo controlado de compra. Un comprobante queda en revisión y el agente nunca afirma que un pago está aprobado, ni solicita o modifica QR, datos bancarios, GPS o comprobantes fuera de ese flujo.
  $terra$,
  encode(digest('base-inicial-terra-v1', 'sha256'), 'hex'),
  '{"seed": true}'::jsonb,
  'pending'
)
on conflict (source_key) do nothing;

insert into public.rag_embedding_jobs (chunk_id, status)
values ('10000000-0000-4000-8000-000000000003', 'queued')
on conflict (chunk_id) do nothing;

-- Backfill de las fichas ya publicadas. No altera el catálogo.
select public.rag_sync_catalog_product(id) from public.catalog_products where published = true;

-- Búsqueda híbrida: FTS funciona inmediatamente; al llegar embeddings, RRF
-- añade coincidencias semánticas sin cambiar el contrato de la aplicación.
create or replace function public.match_terra_rag_chunks(
  query_text text,
  query_embedding extensions.vector(384) default null,
  match_count integer default 8
)
returns table (
  id uuid,
  source_kind text,
  catalog_product_id uuid,
  title text,
  content text,
  metadata jsonb,
  score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with lexical as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, websearch_to_tsquery('spanish', query_text)) desc, c.id) as rank
    from public.rag_chunks c
    left join public.rag_document_versions v on v.id = c.document_version_id
    where c.fts @@ websearch_to_tsquery('spanish', query_text)
      and (c.source_kind = 'catalog' or v.status = 'published')
  ),
  semantic as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding, c.id) as rank
    from public.rag_chunks c
    left join public.rag_document_versions v on v.id = c.document_version_id
    where query_embedding is not null
      and c.embedding is not null
      and (c.source_kind = 'catalog' or v.status = 'published')
  ),
  candidates as (
    select id from lexical union select id from semantic
  ),
  fused as (
    select candidates.id,
      coalesce(1.0 / (60 + lexical.rank), 0.0) + coalesce(1.0 / (60 + semantic.rank), 0.0) as score
    from candidates
    left join lexical using (id)
    left join semantic using (id)
  )
  select c.id, c.source_kind, c.catalog_product_id, c.title, c.content, c.metadata, fused.score
  from fused
  join public.rag_chunks c using (id)
  order by fused.score desc, c.id
  limit greatest(1, least(match_count, 12));
$$;

-- El worker de Edge Functions reclama trabajos sin colisiones entre ejecuciones.
create or replace function public.claim_terra_rag_embedding_jobs(p_limit integer default 20)
returns table (job_id bigint, chunk_id uuid, content text)
language sql
volatile
security definer
set search_path = public
as $$
  with selected as (
    select id
    from public.rag_embedding_jobs
    where status in ('queued', 'failed')
      or (status = 'processing' and updated_at < now() - interval '10 minutes')
    order by updated_at asc, id asc
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  ), claimed as (
    update public.rag_embedding_jobs j
    set status = 'processing', attempts = attempts + 1, last_error = null
    from selected
    where j.id = selected.id
    returning j.id, j.chunk_id
  )
  select claimed.id, claimed.chunk_id, chunks.content
  from claimed
  join public.rag_chunks chunks on chunks.id = claimed.chunk_id;
$$;

alter table public.rag_documents enable row level security;
alter table public.rag_document_versions enable row level security;
alter table public.rag_chunks enable row level security;
alter table public.rag_embedding_jobs enable row level security;

revoke all on public.rag_documents, public.rag_document_versions, public.rag_chunks, public.rag_embedding_jobs from anon, authenticated;
revoke all on function public.publish_terra_rag_version(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.rag_sync_catalog_product(uuid) from public, anon, authenticated;
revoke all on function public.match_terra_rag_chunks(text, extensions.vector, integer) from public, anon, authenticated;
revoke all on function public.claim_terra_rag_embedding_jobs(integer) from public, anon, authenticated;
grant execute on function public.publish_terra_rag_version(uuid, jsonb) to service_role;
grant execute on function public.rag_sync_catalog_product(uuid) to service_role;
grant execute on function public.match_terra_rag_chunks(text, extensions.vector, integer) to service_role;
grant execute on function public.claim_terra_rag_embedding_jobs(integer) to service_role;
