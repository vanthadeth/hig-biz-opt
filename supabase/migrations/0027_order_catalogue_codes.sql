-- 0027_order_catalogue_codes
--
-- `string_agg` in 0026 had no ORDER BY, so the order of the codes it collected
-- was whatever the scan happened to produce. In practice that is stable for a
-- handful of rows and then quietly is not — after a vacuum, a plan change, or
-- once an item has enough variants to be read in parallel.
--
-- Nothing reads the order for meaning, so this is not a correctness bug in the
-- search. It is a value that can change without the data changing, which is
-- enough of a nuisance to fix: it makes an assertion on it flake, and it makes
-- two identical catalogues compare as different.
--
-- The column list is unchanged, so this replaces rather than rebuilds.

create or replace view public.item_catalogue
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
        order by iv.sort_order, iv.created_at
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
