-- Catálogo público de Terra. El sistema comercial externo se conectará más
-- adelante usando external_code, sin reemplazar el contenido editorial.
create extension if not exists pgcrypto;

create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  external_code text unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 140),
  category text not null check (char_length(category) between 1 and 80),
  short_description text not null default '',
  description text not null default '',
  specifications jsonb not null default '[]'::jsonb,
  price_from numeric(12, 2),
  compare_at_price_from numeric(12, 2),
  availability text not null default 'coming_soon' check (availability in ('available', 'out_of_stock', 'coming_soon')),
  published boolean not null default false,
  featured boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  external_code text unique,
  label text not null check (char_length(label) between 1 and 100),
  price numeric(12, 2),
  compare_at_price numeric(12, 2),
  availability text not null default 'coming_soon' check (availability in ('available', 'out_of_stock', 'coming_soon')),
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_home_settings (
  id text primary key check (id = 'home'),
  eyebrow text not null default 'CATÁLOGO TERRA',
  title text not null default 'Encuentra el descanso que buscas.',
  description text not null default 'Explora los productos disponibles y conversa con Terra por WhatsApp para recibir atención directa.',
  image_path text,
  updated_at timestamptz not null default now()
);

create index if not exists catalog_products_public_order_idx on public.catalog_products (published, sort_order, name);
create index if not exists catalog_variants_product_order_idx on public.catalog_variants (product_id, sort_order);
create index if not exists catalog_images_product_order_idx on public.catalog_product_images (product_id, sort_order);

create or replace function public.catalog_touch_updated_at()
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

drop trigger if exists catalog_products_touch_updated_at on public.catalog_products;
create trigger catalog_products_touch_updated_at
before update on public.catalog_products
for each row execute function public.catalog_touch_updated_at();

drop trigger if exists catalog_variants_touch_updated_at on public.catalog_variants;
create trigger catalog_variants_touch_updated_at
before update on public.catalog_variants
for each row execute function public.catalog_touch_updated_at();

drop trigger if exists catalog_home_touch_updated_at on public.catalog_home_settings;
create trigger catalog_home_touch_updated_at
before update on public.catalog_home_settings
for each row execute function public.catalog_touch_updated_at();

alter table public.catalog_products enable row level security;
alter table public.catalog_variants enable row level security;
alter table public.catalog_product_images enable row level security;
alter table public.catalog_home_settings enable row level security;

drop policy if exists "public reads published catalog products" on public.catalog_products;
create policy "public reads published catalog products"
on public.catalog_products for select to anon, authenticated
using (published = true);

drop policy if exists "public reads variants of published products" on public.catalog_variants;
create policy "public reads variants of published products"
on public.catalog_variants for select to anon, authenticated
using (exists (select 1 from public.catalog_products where id = product_id and published = true));

drop policy if exists "public reads images of published products" on public.catalog_product_images;
create policy "public reads images of published products"
on public.catalog_product_images for select to anon, authenticated
using (exists (select 1 from public.catalog_products where id = product_id and published = true));

drop policy if exists "public reads catalog home" on public.catalog_home_settings;
create policy "public reads catalog home"
on public.catalog_home_settings for select to anon, authenticated
using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-images', 'catalog-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

insert into public.catalog_home_settings (id)
values ('home')
on conflict (id) do nothing;

-- Cuatro borradores iniciales: no son visibles para visitantes hasta que el
-- dueño complete su ficha y marque cada registro como publicado.
insert into public.catalog_products (slug, name, category, short_description, description, availability, published, featured, sort_order)
values
  ('producto-terra-01', 'Producto Terra 01', 'Colchones', 'Espacio preparado para tu próximo colchón.', 'Completa esta ficha desde el panel privado antes de publicarla.', 'coming_soon', false, true, 1),
  ('producto-terra-02', 'Producto Terra 02', 'Colchones', 'Espacio preparado para un segundo modelo.', 'Completa esta ficha desde el panel privado antes de publicarla.', 'coming_soon', false, false, 2),
  ('producto-terra-03', 'Producto Terra 03', 'Almohadas', 'Espacio preparado para una almohada o accesorio.', 'Completa esta ficha desde el panel privado antes de publicarla.', 'coming_soon', false, false, 3),
  ('producto-terra-04', 'Producto Terra 04', 'Almohadas', 'Espacio preparado para un cuarto producto.', 'Completa esta ficha desde el panel privado antes de publicarla.', 'coming_soon', false, false, 4)
on conflict (slug) do nothing;
