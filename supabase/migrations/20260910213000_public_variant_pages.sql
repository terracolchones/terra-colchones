-- Una familia sigue viviendo en catalog_products, pero cada versión comercial
-- tiene identidad pública propia: nombre, enlace, precio y galería.
alter table public.catalog_variants
  add column if not exists name text,
  add column if not exists slug text,
  add column if not exists color_name text,
  add column if not exists show_color boolean not null default false,
  add column if not exists show_option_text boolean not null default true,
  add column if not exists is_primary boolean not null default false;

-- Las variantes existentes conservan su etiqueta como nombre; las nuevas
-- columnas solo separan el nombre comercial del texto que se muestra como
-- opción (por ejemplo, "2 plazas").
update public.catalog_variants
set name = coalesce(nullif(trim(name), ''), label)
where name is null or trim(name) = '';

update public.catalog_variants
set show_color = true
where color_hex is not null;

update public.catalog_variants
set show_option_text = false
where label = 'Opción de color';

-- Los enlaces históricos se generan una sola vez. Se añade un fragmento del
-- UUID para que dos nombres iguales no bloqueen la migración; el panel permite
-- reemplazarlos por una URL comercial más corta después.
update public.catalog_variants as variant
set slug = product.slug || '-' || coalesce(
  nullif(trim(both '-' from regexp_replace(lower(variant.name), '[^a-z0-9]+', '-', 'g')), ''),
  'variante'
) || '-' || left(variant.id::text, 8)
from public.catalog_products as product
where variant.product_id = product.id
  and (variant.slug is null or trim(variant.slug) = '');

-- El producto creado antes de este modelo se convierte en su primera versión,
-- sin borrar sus fotos ni las variantes ya existentes.
insert into public.catalog_variants (
  product_id,
  external_code,
  name,
  slug,
  label,
  color_hex,
  color_name,
  show_color,
  show_option_text,
  is_primary,
  price,
  compare_at_price,
  availability,
  active,
  sort_order
)
select
  product.id,
  case
    when product.external_code is not null
      and not exists (
        select 1 from public.catalog_variants as existing
        where existing.external_code = product.external_code
      )
    then product.external_code
    else null
  end,
  product.name,
  product.slug,
  product.name,
  null,
  null,
  false,
  false,
  true,
  product.price_from,
  product.compare_at_price_from,
  product.availability,
  true,
  0
from public.catalog_products as product
where not exists (
  select 1 from public.catalog_variants as existing
  where existing.product_id = product.id
    and existing.is_primary = true
);

alter table public.catalog_variants
  alter column name set not null,
  alter column slug set not null;

alter table public.catalog_variants
  drop constraint if exists catalog_variants_name_check,
  drop constraint if exists catalog_variants_slug_check;

alter table public.catalog_variants
  add constraint catalog_variants_name_check
    check (char_length(name) between 1 and 140),
  add constraint catalog_variants_slug_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');

create unique index if not exists catalog_variants_slug_key
  on public.catalog_variants (slug);

create unique index if not exists catalog_variants_one_primary_idx
  on public.catalog_variants (product_id)
  where is_primary;

-- La primera versión conserva una copia de las fotos del producto como su
-- galería propia. La ficha pública seguirá usando el respaldo general si una
-- variante posterior decide no cargar imágenes.
insert into public.catalog_variant_images (variant_id, storage_path, alt_text, sort_order)
select primary_variant.id, image.storage_path, image.alt_text, image.sort_order
from public.catalog_products as product
join public.catalog_variants as primary_variant
  on primary_variant.product_id = product.id
  and primary_variant.is_primary = true
join public.catalog_product_images as image
  on image.product_id = product.id
on conflict (storage_path) do nothing;
