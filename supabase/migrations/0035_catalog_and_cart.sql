-- 0035_catalog_and_cart
--
-- The Product module has been a blank page since 0007. This gives it the job it
-- was always named for, and settles the overlap with Inventory that has been
-- sitting there since 0022:
--
--   Inventory — the items themselves. Adding, pricing, retiring. Back office.
--   Product   — the catalogue you sell from. Browsing and a cart. Field sales.
--
-- Three things this needs that the schema does not have yet.
--
-- 1. Reading the catalogue as somebody who sells
--
-- Every select policy on the item tables keys on inventory.view, which the sales
-- role does not hold — it holds product.view. So the catalogue would have been
-- an empty page for exactly the people it is for. The policies now admit
-- either, which says what was meant all along: you may read the catalogue if
-- you may see products.
--
-- 2. Stock, enough to answer one question
--
-- A single on-hand figure per item, and a level below which it counts as low.
-- Not a ledger, not per warehouse, not per variant — this exists to colour a
-- badge, and pretending otherwise would be inventing a stock system nobody
-- asked for. When real movements arrive they will replace this column rather
-- than build on it.
--
-- 3. Packing and a cart
--
-- Quantity per box and per carton are facts about the item. The cart is one row
-- per item per person: no cart header, because a cart with nothing in it is
-- indistinguishable from no cart, and nothing yet turns one into an order.

-- Packing and stock ---------------------------------------------------------------
alter table public.items
  add column qty_per_box     integer,
  add column qty_per_carton  integer,
  add column stock_qty       integer not null default 0,
  -- Zero means "never call this low", which is the right default for an item
  -- nobody has thought about yet.
  add column low_stock_qty   integer not null default 0;

alter table public.items
  add constraint items_qty_per_box_ck
    check (qty_per_box is null or qty_per_box > 0),
  add constraint items_qty_per_carton_ck
    check (qty_per_carton is null or qty_per_carton > 0),
  -- Stock may not go negative. A count that has gone below zero is a count that
  -- is wrong, and carrying it forward hides the mistake.
  add constraint items_stock_qty_ck check (stock_qty >= 0),
  add constraint items_low_stock_qty_ck check (low_stock_qty >= 0);

-- Who may read the catalogue -------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'item_categories', 'brands', 'items', 'item_variants', 'item_pictures'
  ] loop
    execute format('drop policy %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (app.can(''inventory'', ''view'') or app.can(''product'', ''view''))',
      t || '_select', t
    );
  end loop;
end;
$$;

-- The catalogue view carries what the shelf needs -----------------------------------
-- Appended columns only, so this replaces rather than rebuilds.
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
    nullif(btrim(concat_ws(' ', i.code, v.barcodes)), '') as codes,
    i.description,
    i.stock_qty,
    i.low_stock_qty,
    i.qty_per_box,
    i.qty_per_carton
  from public.items i
  left join public.item_categories c on c.id = i.category_id
  left join public.item_categories p on p.id = c.parent_id
  left join public.brands b on b.id = i.brand_id
  left join lateral (
    select
      count(*) as variant_count,
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

-- The cart --------------------------------------------------------------------------
-- One row per item per person. `user_id` defaults to the caller rather than
-- being sent, so a client cannot write a line into somebody else's cart even by
-- trying — the same shape 0025 used for a customer's owner.
create table public.cart_lines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade
               default auth.uid(),
  item_id    uuid not null references public.items (id) on delete cascade,
  quantity   integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A line of nothing is not a line; removing it is what "none" means.
  constraint cart_lines_quantity_ck check (quantity > 0)
);

-- Adding an item already in the cart raises its quantity rather than making a
-- second line, and the index is what makes that an upsert instead of a race.
create unique index cart_lines_one_per_item
  on public.cart_lines (user_id, item_id);
create index on public.cart_lines (user_id);

create trigger cart_lines_set_updated_at
  before update on public.cart_lines
  for each row execute function public.set_updated_at();

alter table public.cart_lines enable row level security;

-- A cart is yours. Not a module permission: there is no version of this where
-- one person edits another's cart, so there is nothing to grant.
create policy cart_lines_select on public.cart_lines
  for select to authenticated
  using (user_id = auth.uid());

create policy cart_lines_insert on public.cart_lines
  for insert to authenticated
  with check (user_id = auth.uid() and app.can('product', 'view'));

create policy cart_lines_update on public.cart_lines
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy cart_lines_delete on public.cart_lines
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.cart_lines from authenticated;
grant select, insert, update, delete on public.cart_lines to authenticated;

comment on table public.cart_lines is
  'One row per item per person. There is no cart header: an empty cart and no '
  'cart are the same thing. Nothing turns this into an order yet.';
