-- 0056_district_and_commune_are_text
--
-- A customer's district and commune stop being links.
--
-- 0050 built a machine for turning "ខណ្ឌ កំបូល" into a district code: a
-- name-normalising function, expression indexes on both reference tables,
-- scoped matchers, a trigger to fill the codes in and a guard to keep the
-- three levels consistent with each other. It worked. It was also answering a
-- question nobody was asking.
--
-- What the business does with a district is read it, print it and group by it.
-- The sheet is the system of record and it writes these as words; the codes
-- were only ever there so a name could be resolved back to a row that, in
-- practice, is not there — the district and commune reference tables are empty
-- and filling them means finding, cleaning and maintaining a national dataset
-- for the sake of a foreign key.
--
-- So the words are the answer. `district_text` and `commune_text` stay and
-- become the whole truth; the codes, the matching, and the consistency guard
-- go. The province keeps its code, because that table *is* populated, the
-- sheet already writes the code itself, and grouping the customer book by
-- province is something the app really does.
--
-- Nothing is lost that anybody could see: every code in this database today
-- was derived from the text beside it, and the text is what is kept.
--
-- The reference tables themselves stay. They cost nothing empty, and a
-- district list is still a reasonable thing to want one day — it just will not
-- be what a customer's address hangs off.

-- The view reads the columns, so it goes first and comes back at the end.
drop view if exists public.customer_directory;
drop view if exists public.customer_geo_unmatched;

-- The trigger that filled the codes in, and the guard that kept the three
-- levels agreeing. With two of the three levels gone there is nothing left for
-- either to do: the province's own foreign key is the whole rule now.
drop trigger if exists customers_fill_geo on public.customers;
drop trigger if exists customers_guard_geography on public.customers;
drop function if exists public.fill_customer_geo();
drop function if exists public.guard_customer_geography();

-- The matching machinery, and the four expression indexes built on it.
drop index if exists public.geo_districts_province_code_geo_key_idx;
drop index if exists public.geo_districts_province_code_geo_key_idx1;
drop index if exists public.geo_communes_district_code_geo_key_idx;
drop index if exists public.geo_communes_district_code_geo_key_idx1;
drop function if exists app.match_district(text, text);
drop function if exists app.match_commune(text, text);
drop function if exists app.geo_key(text);

alter table public.customers
  drop column if exists district_code,
  drop column if exists commune_code;

comment on column public.customers.district_text is
  'The district, as the sheet writes it. There is no code: this is the record.';
comment on column public.customers.commune_text is
  'The commune, as the sheet writes it. There is no code: this is the record.';

-- Back, with the two levels reading straight from the text. The column names
-- do not change, so nothing above this has to care where a district comes from.
create view public.customer_directory
with (security_invoker = true) as
  select
    c.id,
    c.shop_name,
    c.business_type,
    c.status,
    c.owner_id,
    u.full_name as owner_name,
    c.street_address,
    c.landmark,
    c.zipcode,
    c.latitude,
    c.longitude,
    c.credit_limit_usd,
    c.last_visit_date,
    c.last_purchase_date,
    coalesce(p.name, c.province_text) as province_name,
    c.district_text as district_name,
    c.commune_text  as commune_name,
    c.province_code,
    ct.name  as primary_contact_name,
    ct.phone as primary_contact_phone,
    pic.photo_path as primary_photo_path,
    (select count(*) from public.customer_contacts x
      where x.customer_id = c.id and x.active) as contact_count
  from public.customers c
  left join public.users u on u.id = c.owner_id
  left join public.geo_provinces p on p.code = c.province_code
  left join lateral (
    select x.name, x.phone
      from public.customer_contacts x
     where x.customer_id = c.id and x.active
     order by x.is_primary desc, x.sort_order, x.created_at
     limit 1
  ) ct on true
  left join lateral (
    select y.photo_path
      from public.customer_pictures y
     where y.customer_id = c.id and y.active
     order by y.is_primary desc, y.sort_order, y.created_at
     limit 1
  ) pic on true;

grant select on public.customer_directory to authenticated;

notify pgrst, 'reload schema';
