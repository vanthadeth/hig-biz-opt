-- 0024_category_bilingual_name
--
-- An item carries both names; its category did not. That is the wrong place to
-- stop — somebody filing stock in Khmer reads the category heading before they
-- read the item under it, so the heading is exactly where the second language
-- earns its keep.
--
-- The column is renamed rather than added beside, so there is never a period
-- where `name` and `name_en` both exist and can disagree. The same split as
-- items: English is required, Khmer is optional, and a row of spaces is not a
-- Khmer name.

alter table public.item_categories rename column name to name_en;
alter table public.item_categories add column name_km text;

alter table public.item_categories
  drop constraint item_categories_name_ck;

alter table public.item_categories
  add constraint item_categories_name_en_ck check (btrim(name_en) <> ''),
  add constraint item_categories_name_km_ck check (name_km is null or btrim(name_km) <> '');

-- The two partial unique indexes followed the rename on their own; only their
-- names are now misleading. Uniqueness stays on the English name alone: it is
-- the one every category is guaranteed to have, so it is the only one that can
-- carry the rule.
alter index item_categories_top_name_unique   rename to item_categories_top_name_en_unique;
alter index item_categories_child_name_unique rename to item_categories_child_name_en_unique;

-- The depth guard reads the parent's name for its error message, and plpgsql
-- resolves that at execution rather than at creation — so the rename above
-- leaves it broken until it is rewritten here.
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
      (select c.name_en from public.item_categories c where c.id = new.parent_id)
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

-- 0023 revoked EXECUTE on this from every client role. `create or replace`
-- keeps the existing ACL, but state it rather than rely on remembering that.
revoke execute on function public.guard_category_depth() from public, anon, authenticated, service_role;

-- The catalogue view -----------------------------------------------------------
-- Dropped and recreated rather than replaced: the category columns are renamed
-- to say which language they hold, and CREATE OR REPLACE VIEW can only append.
drop view public.item_catalogue;

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
      (select iv2.photo_path
         from public.item_variants iv2
        where iv2.item_id = i.id and iv2.photo_path is not null
        order by iv2.sort_order, iv2.created_at
        limit 1)          as photo_path
    from public.item_variants iv
    where iv.item_id = i.id and iv.active
  ) v on true;

grant select on public.item_catalogue to authenticated;
