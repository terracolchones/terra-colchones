-- Cada variante representa una combinación comercial concreta, por ejemplo
-- “2 plazas” con un color específico. Las fotos de variante son opcionales,
-- con un máximo de tres por galería;
-- las fotos generales del producto siguen siendo el respaldo.
alter table public.catalog_variants
  add column if not exists color_hex text;

alter table public.catalog_variants
  drop constraint if exists catalog_variants_color_hex_check;

alter table public.catalog_variants
  add constraint catalog_variants_color_hex_check
  check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$');

-- Compatibilidad con los puntos de color creados por la primera versión.
update public.catalog_variants
set color_hex = lower(label),
    label = 'Opción de color'
where color_hex is null
  and label ~ '^#[0-9A-Fa-f]{6}$';

create table if not exists public.catalog_variant_images (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.catalog_variants(id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index if not exists catalog_variant_images_variant_order_idx
  on public.catalog_variant_images (variant_id, sort_order);

alter table public.catalog_variant_images enable row level security;

drop policy if exists "public reads images of published catalog variants" on public.catalog_variant_images;
create policy "public reads images of published catalog variants"
on public.catalog_variant_images for select to anon, authenticated
using (
  exists (
    select 1
    from public.catalog_variants
    join public.catalog_products on public.catalog_products.id = public.catalog_variants.product_id
    where public.catalog_variants.id = variant_id
      and public.catalog_products.published = true
  )
);
