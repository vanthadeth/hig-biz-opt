-- 0022_inventory
--
-- The catalogue: what HIG sells, what it is called in both languages, and what
-- it costs in both currencies.
--
-- Four tables, and the shape of each is decided by something real:
--
--   * A category may have sub-categories, but a sub-category may not. One level
--     is what was asked for, and one level is what a trigger holds it to — a
--     CHECK constraint cannot see the parent row, so depth is not expressible
--     there.
--
--   * A brand is optional on an item. Plenty of stock is unbranded.
--
--   * Price and picture belong to the *variant*, not the item, because a 500 ml
--     bottle and a 1.5 L bottle of the same water are different money and a
--     different photograph. An item with nothing to vary still has exactly one
--     variant row, with no attribute on it, which is where its price lives. So
--     "the price of an item" has one answer everywhere in the system rather
--     than two that can disagree.
--
--   * USD and KHR are both stored. Deriving one from the other would bake
--     today's rate into yesterday's price list, and rounding riel is a
--     commercial decision, not an arithmetic one.

-- Categories ------------------------------------------------------------------
create table public.item_categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.item_categories (id) on delete restrict,
  name        text not null,
  description text,
  photo_path  text,          -- object path in the private `inventory` bucket
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint item_categories_name_ck check (btrim(name) <> ''),
  constraint item_categories_not_own_parent_ck check (parent_id is null or parent_id <> id)
);

-- Names are unique among siblings, case-insensitively: two "Drinks" under
-- "Grocery" is a data-entry slip, while "Drinks" under two different parents is
-- perfectly ordinary.
create unique index item_categories_top_name_unique
  on public.item_categories (lower(name)) where parent_id is null;
create unique index item_categories_child_name_unique
  on public.item_categories (parent_id, lower(name)) where parent_id is not null;

create index on public.item_categories (parent_id, sort_order);

-- One level, enforced ---------------------------------------------------------
-- Two ways to break it: hang a category under one that already has a parent, or
-- give a parent a parent. Both are refused here.
-- Security definer, and not for the usual reason: the checks below read
-- item_categories, and somebody holding inventory.add without inventory.view
-- would have the parent row hidden from them by the select policy — the guard
-- would then find nothing and wave the row through.
create function public.guard_category_depth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.item_categories c
    where c.id = new.parent_id and c.parent_id is not null
  ) then
    raise exception 'Categories go one level deep: % already sits under another category',
      (select c.name from public.item_categories c where c.id = new.parent_id)
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and exists (
    select 1 from public.item_categories c where c.parent_id = new.id
  ) then
    raise exception 'This category has sub-categories of its own, so it cannot be moved under another'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger item_categories_guard_depth
  before insert or update on public.item_categories
  for each row execute function public.guard_category_depth();

-- As 0012: a trigger function is not API surface.
revoke execute on function public.guard_category_depth() from public;

create trigger item_categories_set_updated_at
  before update on public.item_categories
  for each row execute function public.set_updated_at();

-- Brands ----------------------------------------------------------------------
create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  logo_path   text,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint brands_name_ck check (btrim(name) <> '')
);

create unique index brands_name_unique on public.brands (lower(name));
create index on public.brands (sort_order);

create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

-- Items -----------------------------------------------------------------------
create table public.items (
  id          uuid primary key default gen_random_uuid(),
  code        text,          -- the internal reference, when there is one
  name_en     text not null,
  name_km     text,
  description text,
  category_id uuid references public.item_categories (id) on delete restrict,
  brand_id    uuid references public.brands (id) on delete restrict,
  active      boolean not null default true,
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint items_name_en_ck check (btrim(name_en) <> ''),
  -- Khmer is optional, but a row of spaces is not a Khmer name.
  constraint items_name_km_ck check (name_km is null or btrim(name_km) <> '')
);

create unique index items_code_unique on public.items (lower(code)) where code is not null;
create index on public.items (category_id);
create index on public.items (brand_id);
create index on public.items (active);

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- Variants --------------------------------------------------------------------
create table public.item_variants (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.items (id) on delete cascade,
  -- Held as a pair rather than a name on the item, so "Size / 500 ml" and
  -- "Colour / Blue" can sit side by side on one item without a second table.
  attribute_name  text,
  attribute_value text,
  price_usd       numeric(12, 2),
  price_khr       numeric(14, 0),
  photo_path      text,
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A value without a name reads as nothing on screen; a name without a value
  -- is an unfinished row. Neither, together, is the plain single-price item.
  constraint item_variants_attribute_ck check (
    (attribute_name is null and attribute_value is null)
    or (btrim(coalesce(attribute_name, '')) <> '' and btrim(coalesce(attribute_value, '')) <> '')
  ),
  constraint item_variants_price_usd_ck check (price_usd is null or price_usd >= 0),
  constraint item_variants_price_khr_ck check (price_khr is null or price_khr >= 0)
);

-- The same attribute twice on one item is always a mistake. Coalescing lets the
-- index cover the no-attribute row too, so an item cannot end up with two of
-- those either.
create unique index item_variants_attribute_unique
  on public.item_variants (
    item_id,
    lower(coalesce(attribute_name, '')),
    lower(coalesce(attribute_value, ''))
  );

create index on public.item_variants (item_id, sort_order);

create trigger item_variants_set_updated_at
  before update on public.item_variants
  for each row execute function public.set_updated_at();

-- Reading the catalogue in one query ------------------------------------------
-- The list screen wants a name, a category, a brand and a price range per item;
-- assembling that in the browser would be four requests and a join by hand.
create view public.item_catalogue
with (security_invoker = true)
as
  select
    i.id,
    i.code,
    i.name_en,
    i.name_km,
    i.active,
    i.category_id,
    c.name        as category_name,
    c.parent_id   as category_parent_id,
    p.name        as category_parent_name,
    i.brand_id,
    b.name        as brand_name,
    v.variant_count,
    v.min_price_usd,
    v.max_price_usd,
    v.min_price_khr,
    v.max_price_khr,
    v.photo_path
  from public.items i
  left join public.item_categories c on c.id = i.category_id
  left join public.item_categories p on p.id = c.parent_id
  left join public.brands b on b.id = i.brand_id
  left join lateral (
    select
      count(*)            as variant_count,
      min(iv.price_usd)   as min_price_usd,
      max(iv.price_usd)   as max_price_usd,
      min(iv.price_khr)   as min_price_khr,
      max(iv.price_khr)   as max_price_khr,
      -- The first picture any variant carries stands for the item in a list.
      (select iv2.photo_path
         from public.item_variants iv2
        where iv2.item_id = i.id and iv2.photo_path is not null
        order by iv2.sort_order, iv2.created_at
        limit 1)          as photo_path
    from public.item_variants iv
    where iv.item_id = i.id and iv.active
  ) v on true;

-- Row level security ----------------------------------------------------------
-- The catalogue has no owner, so scope has nothing to narrow: holding the
-- module at any scope reaches all of it. That is deliberate — a price list that
-- showed different rows to different sales people would be a different product.
alter table public.item_categories enable row level security;
alter table public.brands          enable row level security;
alter table public.items           enable row level security;
alter table public.item_variants   enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['item_categories', 'brands', 'items', 'item_variants'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (app.can(''inventory'', ''view''))',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      || 'with check (app.can(''inventory'', ''add''))',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using (app.can(''inventory'', ''edit'')) '
      || 'with check (app.can(''inventory'', ''edit''))',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      || 'using (app.can(''inventory'', ''delete''))',
      t || '_delete', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

grant select on public.item_catalogue to authenticated;

-- Pictures --------------------------------------------------------------------
-- One private bucket for the whole module. Objects sit under "categories/…",
-- "brands/…" or "items/<item id>/…", which keeps them findable by hand without
-- the policies having to care which is which: the module governs all three.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventory', 'inventory', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy inventory_read on storage.objects
  for select to authenticated
  using (bucket_id = 'inventory' and app.can('inventory', 'view'));

create policy inventory_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'inventory'
    and (app.can('inventory', 'add') or app.can('inventory', 'edit'))
  );

create policy inventory_update on storage.objects
  for update to authenticated
  using (bucket_id = 'inventory' and app.can('inventory', 'edit'));

create policy inventory_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'inventory' and app.can('inventory', 'edit'));

-- The module registry ---------------------------------------------------------
-- Slotted next to Product rather than appended, so the permission matrix reads
-- in the order somebody would think about the business.
update public.modules set sort_order = sort_order + 1 where sort_order >= 4;

insert into public.modules (key, name, icon, href, sort_order) values
  ('inventory', 'Inventory', 'box', 'inventory', 4);

-- Where it appears. The administrator runs the catalogue; the accountant needs
-- it to price an invoice, and was asked to be able to maintain it too.
insert into public.view_modules (view_key, module_key, sort_order) values
  ('admin',      'inventory', 5),
  ('accounting', 'inventory', 5);

-- Who may do what -------------------------------------------------------------
insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, p.module_key, p.action::public.permission_action, p.scope::public.permission_scope
from (values
  ('system_admin', 'inventory', 'view',   'any'),
  ('system_admin', 'inventory', 'add',    'any'),
  ('system_admin', 'inventory', 'edit',   'any'),
  ('system_admin', 'inventory', 'delete', 'any'),

  -- Read, create and change, but not destroy: an accountant correcting a price
  -- is routine, an accountant removing a product from the catalogue is not.
  ('accounting',   'inventory', 'view',   'any'),
  ('accounting',   'inventory', 'add',    'any'),
  ('accounting',   'inventory', 'edit',   'any')
) as p(role_key, module_key, action, scope)
join public.roles r on r.key = p.role_key;
