-- Aplicar únicamente al almacenamiento del catálogo, previa autorización.
-- Los códigos son públicos, aleatorios e independientes de los IDs internos.
create table if not exists public.catalog_short_links (
  code text primary key check (code ~ '^[2-9][a-hj-km-np-z2-9]{2,7}$'),
  product_id uuid references public.catalog_products(id) on delete set null,
  variant_id uuid unique references public.catalog_variants(id) on delete set null,
  target_kind text not null default 'product' check (target_kind in ('product', 'variant')),
  check (target_kind = 'variant' or variant_id is null),
  created_at timestamptz not null default now()
);

create unique index if not exists catalog_short_links_product_unique
  on public.catalog_short_links(product_id) where target_kind = 'product';
create index if not exists catalog_short_links_recent_idx
  on public.catalog_short_links(created_at desc, code desc) where product_id is not null;

-- No se permite acceso desde el navegador. La API autenticada usa service_role.
alter table public.catalog_short_links enable row level security;
revoke all on table public.catalog_short_links from public, anon, authenticated;
grant select, insert, update, delete on table public.catalog_short_links to service_role;

comment on table public.catalog_short_links is
  'Enlaces públicos de producto. Conservar filas huérfanas para no reutilizar códigos de productos eliminados.';
