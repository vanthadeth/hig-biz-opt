-- 0050_resolve_customer_geo
--
-- Turning "Chamkarmon" into a district.
--
-- The customer sheet writes the commune and the district as people say them —
-- "Khan Chamkar Mon", "សង្កាត់ទន្លេបាសាក់", "Boeung Keng Kang 1" — while this
-- database keeps them as rows in `geo_districts` and `geo_communes` with
-- official codes. Something has to get from one to the other, and it cannot be
-- the sheet: nobody is going to type a commune code into a spreadsheet.
--
-- WHAT IS NOT DONE HERE IS INVENTING GEOGRAPHY. A name that matches nothing
-- keeps its text and gets a null code. The alternative — creating a district
-- row for every spelling that walks in — would fill the reference table with
-- "Chamkarmon", "Chamkar Mon" and "chamkarmorn" as three different districts,
-- and every report grouped by district would be wrong in a way nobody could
-- see. The text is kept either way, so nothing is lost; `public.customer_geo_
-- unmatched` lists what did not match so somebody can fix the spelling or add
-- the missing row.
--
-- MATCHING IS SCOPED. District names repeat across provinces and commune names
-- repeat across districts, so a district is only looked for inside the
-- customer's province and a commune only inside its district. An unscoped
-- match would be a coin toss dressed as a lookup.
--
-- AND IT IS ONLY EVER ADDITIVE. A code that is already set is never changed:
-- somebody who picked a district by hand in the form has said something more
-- reliable than a string match, and the next sync must not overrule them.

-- Names as they compare, rather than as they are written --------------------------------
-- Case, punctuation, doubled spaces and the words that mean "district" are all
-- noise. Khmer has no case, so lower() is a no-op there and harmless.
create function app.geo_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        -- The administrative words, in both languages, at the front where they
        -- always sit. "Khan Chamkarmon" and "Chamkarmon" are one place.
        -- Khmer first, where the word for "district" is written against the
        -- name with nothing between them — ខណ្ឌចំការមន is one word on the page
        -- and two ideas in it.
        regexp_replace(
          regexp_replace(
            lower(btrim(coalesce(p_name, ''))),
            '^(សង្កាត់|ខណ្ឌ|ស្រុក|ឃុំ|ក្រុង|ខេត្ត)\s*',
            ''
          ),
          '^(khan|srok|sangkat|khum|krong|district|commune|city)[\s.]+',
          '', 'i'
        ),
        -- Everything that is not a letter, a digit or a space, then runs of
        -- space. Hyphens and full stops vary by typist and mean nothing.
        '[^[:alnum:][:space:]ក-៿]+', ' ', 'g'
      )
    ),
    ''
  );
$$;

comment on function app.geo_key(text) is
  'A place name reduced to what actually identifies it: no case, no '
  'punctuation, no leading "Khan"/"Sangkat"/"District".';

create index on public.geo_districts (province_code, (app.geo_key(name)));
create index on public.geo_districts (province_code, (app.geo_key(name_alt)));
create index on public.geo_communes (district_code, (app.geo_key(name)));
create index on public.geo_communes (district_code, (app.geo_key(name_alt)));

-- Filling in what can be filled in -----------------------------------------------------
create function app.match_district(p_province text, p_text text)
returns text
language sql
stable
set search_path = ''
as $$
  -- Two districts in one province answering to the same name would be a fault
  -- in the reference data; picking one at random would hide it, so a match is
  -- taken only when there is exactly one.
  select code from (
    select d.code, count(*) over () as n
      from public.geo_districts d
     where d.province_code = p_province
       and app.geo_key(p_text) is not null
       and app.geo_key(p_text) in (app.geo_key(d.name), app.geo_key(d.name_alt))
  ) found
   where found.n = 1;
$$;

create function app.match_commune(p_district text, p_text text)
returns text
language sql
stable
set search_path = ''
as $$
  select code from (
    select c.code, count(*) over () as n
      from public.geo_communes c
     where c.district_code = p_district
       and app.geo_key(p_text) is not null
       and app.geo_key(p_text) in (app.geo_key(c.name), app.geo_key(c.name_alt))
  ) found
   where found.n = 1;
$$;

/*
 * Set on the way in, so the sync, the form and a hand-written insert all get
 * the same treatment without any of them having to remember.
 *
 * Only ever fills a blank. A code somebody chose from a dropdown outranks a
 * string match, and a later sync of the same row must not quietly move a shop
 * into the next district.
 */
create function public.fill_customer_geo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.district_code is null and new.province_code is not null then
    new.district_code := app.match_district(new.province_code, new.district_text);
  end if;

  -- A commune sits inside a district; without one there is nothing to scope
  -- the search to, and every commune name in the country is a candidate.
  if new.commune_code is null and new.district_code is not null then
    new.commune_code := app.match_commune(new.district_code, new.commune_text);
  end if;

  return new;
end;
$$;

create trigger customers_fill_geo
  before insert or update of province_text, district_text, commune_text,
                             province_code, district_code, commune_code
  on public.customers
  for each row execute function public.fill_customer_geo();

-- What did not match -------------------------------------------------------------------
-- The point of leaving a name unresolved rather than inventing a row for it is
-- that somebody can see it and fix it. This is where they look.
create view public.customer_geo_unmatched
with (security_invoker = true) as
  select
    c.id,
    c.shop_name,
    c.province_code,
    c.province_text,
    c.district_text,
    c.commune_text,
    (c.district_text is not null and c.district_code is null) as district_unmatched,
    (c.commune_text  is not null and c.commune_code  is null) as commune_unmatched
  from public.customers c
 where (c.district_text is not null and c.district_code is null)
    or (c.commune_text  is not null and c.commune_code  is null);

comment on view public.customer_geo_unmatched is
  'Customers whose commune or district was written in the sheet but matched no '
  'row. Fix the spelling, or add the missing place — never both spellings.';

grant select on public.customer_geo_unmatched to authenticated;

grant execute on function app.geo_key(text) to authenticated;
grant execute on function app.match_district(text, text) to authenticated;
grant execute on function app.match_commune(text, text) to authenticated;

notify pgrst, 'reload schema';
