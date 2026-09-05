-- 0040_name_and_name_alt
--
-- `name_en` and `name_km` become `name` and `name_alt`.
--
-- The old pair named two languages. That was true of the catalogue, where every
-- item has an English name and might have a Khmer one, and it stopped being
-- true the moment anything else needed a second name for a different reason —
-- a trade name beside a legal one, an abbreviation beside a full title. A
-- column called name_km can only ever hold Khmer; a column called name_alt
-- holds whatever the second name is.
--
-- Nothing about the shape changes: `name` is still required, `name_alt` still
-- optional. This is a rename, and the data is untouched.
--
-- Five tables, one view, one function, six constraints and four indexes carry
-- the old names. Renaming a column takes constraints, indexes and views along
-- with it silently — but their *names* go stale, and a view's output column
-- keeps whatever it was called at creation. So the constraints and indexes are
-- renamed for legibility and the view is rebuilt for correctness.

-- The columns -------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'items', 'item_categories', 'geo_provinces', 'geo_districts', 'geo_communes'
  ] loop
    execute format('alter table public.%I rename column name_en to name', t);
    execute format('alter table public.%I rename column name_km to name_alt', t);
  end loop;
end;
$$;

-- Their constraints and indexes, which a rename leaves working but misnamed ------
alter table public.items rename constraint items_name_en_ck to items_name_ck;
alter table public.items rename constraint items_name_km_ck to items_name_alt_ck;
alter table public.item_categories
  rename constraint item_categories_name_en_ck to item_categories_name_ck;
alter table public.item_categories
  rename constraint item_categories_name_km_ck to item_categories_name_alt_ck;
alter table public.geo_provinces
  rename constraint geo_provinces_name_en_ck to geo_provinces_name_ck;
alter table public.geo_districts
  rename constraint geo_districts_name_en_ck to geo_districts_name_ck;
alter table public.geo_communes
  rename constraint geo_communes_name_en_ck to geo_communes_name_ck;

alter index public.item_categories_top_name_en_unique
  rename to item_categories_top_name_unique;
alter index public.item_categories_child_name_en_unique
  rename to item_categories_child_name_unique;
alter index public.geo_districts_province_code_name_en_idx
  rename to geo_districts_province_code_name_idx;
alter index public.geo_communes_district_code_name_en_idx
  rename to geo_communes_district_code_name_idx;

-- The depth guard ----------------------------------------------------------------
-- A plpgsql body is text, so a column rename does not reach inside it. This one
-- reads a category's name to say which category is in the way.
create or replace function public.guard_category_depth()
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

-- The catalogue view --------------------------------------------------------------
-- Dropped and rebuilt rather than replaced: a view's output columns cannot be
-- renamed in place, and these were named after the base columns.
drop view public.item_catalogue;

create view public.item_catalogue
with (security_invoker = true)
as
  select
    i.id,
    i.code,
    i.name,
    i.name_alt,
    i.active,
    i.price_usd,
    i.price_khr,
    i.category_id,
    c.name        as category_name,
    c.name_alt    as category_name_alt,
    c.parent_id   as category_parent_id,
    p.name        as category_parent_name,
    p.name_alt    as category_parent_name_alt,
    i.brand_id,
    b.name        as brand_name,
    v.variant_count,
    coalesce(pic.photo_path, v.photo_path) as photo_path,
    nullif(btrim(concat_ws(' ', i.code, v.barcodes)), '') as codes,
    i.description,
    i.stock_qty,
    i.low_stock_qty,
    i.qty_per_box,
    i.qty_per_carton,
    i.sheet_id
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

-- What the sync knows about it -------------------------------------------------------
update public.sync_targets set key_column = 'name' where key_column = 'name_en';

-- A mapping already pointing at the old column would fail its own guard on the
-- next save, and silently stop being written in the meantime.
update public.sync_column_maps set target_column = 'name'     where target_column = 'name_en';
update public.sync_column_maps set target_column = 'name_alt' where target_column = 'name_km';

notify pgrst, 'reload schema';
