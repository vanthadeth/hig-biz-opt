-- 0026_variant_code_and_barcode
--
-- The variant becomes the sellable unit.
--
-- Until now the item carried the code and the variant carried an "attribute" —
-- a name and a value. Both were the wrong way round for how stock is actually
-- handled. What a person picks up, scans and sells is one variant: a 500 ml
-- bottle, not "drinking water in general". So the code moves down to the
-- variant and a barcode joins it, and the pair that distinguishes one variant
-- from its siblings is renamed from attribute to property, which is the word
-- the business uses.
--
-- `items.code` is not dropped before its contents are rescued: whatever code an
-- item carried moves to that item's first variant, so nothing already entered
-- is lost to a rename.

-- Attribute becomes property ---------------------------------------------------
-- A rename rather than new columns, so there is never a period where both exist
-- and can disagree. Postgres rewrites the dependent CHECK and index expressions
-- on its own; only their names are left saying the old thing, so those are
-- renamed too.
alter table public.item_variants rename column attribute_name  to property_name;
alter table public.item_variants rename column attribute_value to property_value;

alter table public.item_variants
  rename constraint item_variants_attribute_ck to item_variants_property_ck;

alter index item_variants_attribute_unique rename to item_variants_property_unique;

-- The code and the barcode -----------------------------------------------------
alter table public.item_variants add column code    text;
alter table public.item_variants add column barcode text;

alter table public.item_variants
  add constraint item_variants_code_ck check (code is null or btrim(code) <> ''),
  add constraint item_variants_barcode_ck check (barcode is null or btrim(barcode) <> '');

-- Move what the item held down to its first variant, before the column goes.
update public.item_variants v
   set code = i.code
  from public.items i
 where i.id = v.item_id
   and i.code is not null
   and v.id = (
     select x.id from public.item_variants x
      where x.item_id = i.id
      order by x.sort_order, x.created_at
      limit 1
   );

-- The catalogue view reads items.code, so it has to go first and come back
-- afterwards. It is rebuilt rather than replaced because its columns change.
drop view public.item_catalogue;

drop index items_code_unique;
alter table public.items drop column code;

-- Both are unique across the whole catalogue rather than within one item: a
-- code that identifies two different things is not an identifier, and a barcode
-- names a product to the whole world, not just to us. Case-folded for the code,
-- because "HIG-001" and "hig-001" are the same box on a shelf; exact for the
-- barcode, which is a machine-read string with no case to fold.
create unique index item_variants_code_unique
  on public.item_variants (lower(code)) where code is not null;
create unique index item_variants_barcode_unique
  on public.item_variants (barcode) where barcode is not null;

create view public.item_catalogue
with (security_invoker = true)
as
  select
    i.id,
    i.name_en,
    i.name_km,
    i.active,
    i.category_id,
    c.name_en     as category_name_en,
    c.name_km     as category_name_km,
    c.parent_id   as category_parent_id,
    p.name_en     as category_parent_name_en,
    p.name_km     as category_parent_name_km,
    i.brand_id,
    b.name        as brand_name,
    v.variant_count,
    v.min_price_usd,
    v.max_price_usd,
    v.min_price_khr,
    v.max_price_khr,
    v.photo_path,
    -- Every code and barcode on the item, in one string. The list searches it,
    -- which is what lets somebody find an item by scanning or typing the code
    -- of one variant of it without the browser fetching every variant first.
    v.codes
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
      nullif(btrim(string_agg(
        concat_ws(' ', iv.code, iv.barcode), ' '
      )), '')             as codes,
      (select iv2.photo_path
         from public.item_variants iv2
        where iv2.item_id = i.id and iv2.photo_path is not null
        order by iv2.sort_order, iv2.created_at
        limit 1)          as photo_path
    from public.item_variants iv
    where iv.item_id = i.id and iv.active
  ) v on true;

grant select on public.item_catalogue to authenticated;
