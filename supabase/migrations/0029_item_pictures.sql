-- 0029_item_pictures
--
-- An item gets its own pictures, several of them, one of which is primary.
--
-- Until now the only picture an item had was whatever its first variant
-- carried. That was back to front. The photograph that represents an item in a
-- list — the bottle on a white background — belongs to the item; a variant's
-- picture is the narrower thing, the particular size or colour. An item that
-- has no variants at all had nowhere to put a picture, and after 0028 an item
-- with no variants is the ordinary case rather than the exception.
--
-- Same shape as customer_pictures, deliberately: a path, an optional caption,
-- one primary enforced by a partial unique index. Somebody who has learnt one
-- of these screens has learnt both.

create table public.item_pictures (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items (id) on delete cascade,
  photo_path  text not null,
  description text,
  is_primary  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),

  constraint item_pictures_photo_path_ck check (btrim(photo_path) <> ''),
  constraint item_pictures_description_ck
    check (description is null or btrim(description) <> '')
);

-- At most one primary per item, and the database is what says so: a form that
-- ticks a second box without clearing the first would otherwise leave two.
create unique index item_pictures_one_primary
  on public.item_pictures (item_id) where is_primary;
create index on public.item_pictures (item_id, sort_order);

-- The catalogue's picture ------------------------------------------------------
-- The item's own primary picture leads; a variant's photo stands in when the
-- item has none, so nothing already entered stops showing.
--
-- The column list is unchanged, so this replaces rather than rebuilds.
create or replace view public.item_catalogue
with (security_invoker = true)
as
  select
    i.id,
    i.code,
    i.name_en,
    i.name_km,
    i.active,
    i.price_usd,
    i.price_khr,
    i.category_id,
    c.name_en     as category_name_en,
    c.name_km     as category_name_km,
    c.parent_id   as category_parent_id,
    p.name_en     as category_parent_name_en,
    p.name_km     as category_parent_name_km,
    i.brand_id,
    b.name        as brand_name,
    v.variant_count,
    coalesce(pic.photo_path, v.photo_path) as photo_path,
    nullif(btrim(concat_ws(' ', i.code, v.barcodes)), '') as codes
  from public.items i
  left join public.item_categories c on c.id = i.category_id
  left join public.item_categories p on p.id = c.parent_id
  left join public.brands b on b.id = i.brand_id
  left join lateral (
    select
      count(*) as variant_count,
      -- Ordered, so the value cannot change without the data changing.
      nullif(btrim(string_agg(
        coalesce(iv.barcode, ''), ' ' order by iv.sort_order, iv.created_at
      )), '') as barcodes,
      (select iv2.photo_path
         from public.item_variants iv2
        where iv2.item_id = i.id and iv2.photo_path is not null
        order by iv2.sort_order, iv2.created_at
        limit 1) as photo_path
    from public.item_variants iv
    where iv.item_id = i.id and iv.active
  ) v on true
  left join lateral (
    select y.photo_path
      from public.item_pictures y
     where y.item_id = i.id
     order by y.is_primary desc, y.sort_order, y.created_at
     limit 1
  ) pic on true;

grant select on public.item_catalogue to authenticated;

-- Row level security -----------------------------------------------------------
-- The same rules as the rest of the module: pictures of stock are not more
-- sensitive than the stock, and are governed by the same permissions.
--
-- Insert takes `add` OR `edit`, unlike item_variants which takes `add` alone.
-- Attaching a picture happens twice: while creating an item, where the person
-- holds `add`, and years later to an item that already exists, where they hold
-- `edit`. Requiring only `add` would refuse the second, which is the commoner
-- of the two.
alter table public.item_pictures enable row level security;

create policy item_pictures_select on public.item_pictures
  for select to authenticated
  using (app.can('inventory', 'view'));

create policy item_pictures_insert on public.item_pictures
  for insert to authenticated
  with check (app.can('inventory', 'add') or app.can('inventory', 'edit'));

create policy item_pictures_update on public.item_pictures
  for update to authenticated
  using (app.can('inventory', 'edit'))
  with check (app.can('inventory', 'edit'));

create policy item_pictures_delete on public.item_pictures
  for delete to authenticated
  using (app.can('inventory', 'edit'));

grant select, insert, update, delete on public.item_pictures to authenticated;
