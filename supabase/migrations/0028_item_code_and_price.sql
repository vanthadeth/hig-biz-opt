-- 0028_item_code_and_price
--
-- The code and the price move back up to the item, and the variant goes back to
-- describing rather than pricing.
--
-- 0026 put both on the variant on the reasoning that the variant is what gets
-- picked up and scanned. That is true of a barcode and it is not true of how HIG
-- actually prices: one item has one price, and its variants are the sizes and
-- colours it comes in. A price per variant made every screen show a *range*
-- where a single figure was meant, and it made "the price of an item" a question
-- with an awkward answer.
--
-- So:
--   * items gain code, price_usd and price_khr
--   * item_variants lose code, price_usd and price_khr
--   * item_variants keep property/value, barcode and picture — what a variant
--     actually is: the size, the colour, the box it comes in
--
-- The barcode stays on the variant deliberately. It is the one identifier that
-- genuinely differs between a 500 ml bottle and a 1.5 L one, because it is
-- assigned to the physical package rather than to the product.
--
-- Nothing already entered is thrown away: each item takes the code and the
-- prices of its first variant before those columns go.

alter table public.items
  add column code      text,
  add column price_usd numeric(12, 2),
  add column price_khr numeric(14, 0);

alter table public.items
  add constraint items_code_ck check (code is null or btrim(code) <> ''),
  add constraint items_price_usd_ck check (price_usd is null or price_usd >= 0),
  add constraint items_price_khr_ck check (price_khr is null or price_khr >= 0);

-- Carry the first variant's code and price up to the item it belongs to.
update public.items i
   set code      = v.code,
       price_usd = v.price_usd,
       price_khr = v.price_khr
  from (
    select distinct on (item_id) item_id, code, price_usd, price_khr
    from public.item_variants
    order by item_id, sort_order, created_at
  ) v
 where v.item_id = i.id;

create unique index items_code_unique
  on public.items (lower(code)) where code is not null;

-- The view reads the columns that are about to go, so it stands down first.
drop view public.item_catalogue;

drop index item_variants_code_unique;
alter table public.item_variants
  drop constraint item_variants_code_ck,
  drop column code,
  drop column price_usd,
  drop column price_khr;

-- The price range is gone with the per-variant price: an item has one price, so
-- the catalogue reports one price. `codes` still exists for search, and now
-- holds the item's own code plus every barcode beneath it — which is exactly
-- what somebody types or scans when looking for it.
create view public.item_catalogue
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
    v.photo_path,
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
  ) v on true;

grant select on public.item_catalogue to authenticated;
