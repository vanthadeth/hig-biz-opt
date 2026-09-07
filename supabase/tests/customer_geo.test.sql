-- customer_geo.test.sql
--
-- Turning "Khan Chamkar Mon" into a district.
--
-- The customer sheet writes the commune and the district as people say them —
-- "Khan Chamkar Mon", "សង្កាត់ទន្លេបាសាក់", "Boeung Keng Kang 1" — while this
-- database keeps them as rows with official codes. Something has to get from
-- one to the other, and it cannot be the sheet: nobody is going to type a
-- commune code into a spreadsheet.
--
-- Two questions decide whether that matching is trustworthy.
--
-- Does it refuse when it should. A name matching nothing keeps its text and
-- gets a null code, because creating a district row for every spelling that
-- walks in would fill the reference table with "Chamkarmon", "Chamkar Mon" and
-- "chamkarmorn" as three different places, and every report grouped by
-- district would then be wrong in a way nobody could see. Two districts of the
-- same name in one province are refused for the same reason: guessing between
-- them hides a fault in the reference data.
--
-- And is it scoped. District names repeat across provinces and commune names
-- across districts, so a district is looked for only inside the customer's
-- province and a commune only inside its district — asserted here with the
-- same commune name deliberately placed in two districts.
--
-- Everything happens inside one transaction that is deliberately rolled back,
-- so a run leaves no trace.
--
--     psql "$DATABASE_URL" -f supabase/tests/customer_geo.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  GEO OK - 26 assertions passed
--
-- Anything else is a real failure and names the assertion that broke.

create or replace function pg_temp.bump() returns void language plpgsql as $f$
begin
  perform set_config('higtest.checks',
    (coalesce(current_setting('higtest.checks', true), '0')::int + 1)::text, false);
end;
$f$;

create or replace function pg_temp.eq(p_label text, p_actual text, p_expected text)
returns void language plpgsql as $f$
begin
  perform pg_temp.bump();
  if p_actual is distinct from p_expected then
    raise exception 'FAILED: % -- expected %, got %', p_label,
      coalesce(p_expected,'null'), coalesce(p_actual,'null');
  end if;
end;
$f$;

create or replace function pg_temp.ok(p_label text, p_actual boolean)
returns void language plpgsql as $f$
begin
  perform pg_temp.bump();
  if p_actual is distinct from true then
    raise exception 'FAILED: % -- expected true, got %', p_label, coalesce(p_actual::text,'null');
  end if;
end;
$f$;


do $$
declare
  v_id  uuid;
  v_rep uuid := gen_random_uuid();
begin
  perform set_config('higtest.checks', '0', false);

  -- A small, made-up geography, so nothing here depends on what the real
  -- dataset happens to contain today.
  insert into public.geo_provinces (code, name, name_alt, sort_order)
    values ('TP', 'Testville', 'ក្រុងតេស្ត', 99);
  insert into public.geo_districts (code, province_code, name, name_alt) values
    ('TP-01', 'TP', 'Chamkar Mon', 'ចំការមន'),
    ('TP-02', 'TP', 'Tuol Kouk',   'ទួលគោក');
  insert into public.geo_communes (code, district_code, name, name_alt) values
    ('TP-01-01', 'TP-01', 'Boeung Keng Kang 1', 'បឹងកេងកង១'),
    ('TP-01-02', 'TP-01', 'Tonle Bassac',       'ទន្លេបាសាក់'),
    -- The same commune name in the other district: the reason matching is
    -- scoped rather than done against the whole country.
    ('TP-02-01', 'TP-02', 'Tonle Bassac',       'ទន្លេបាសាក់');

  ----------------------------------------------------------------------------
  -- Names as they compare, rather than as they are written
  ----------------------------------------------------------------------------
  perform pg_temp.eq('case is noise',
    app.geo_key('CHAMKAR MON'), app.geo_key('chamkar mon'));
  perform pg_temp.eq('so is the word "Khan" in front of a district',
    app.geo_key('Khan Chamkar Mon'), app.geo_key('Chamkar Mon'));
  perform pg_temp.eq('and "Sangkat" in front of a commune',
    app.geo_key('Sangkat Tonle Bassac'), app.geo_key('Tonle Bassac'));
  perform pg_temp.eq('and punctuation, and doubled spaces',
    app.geo_key('  Chamkar-Mon.  '), app.geo_key('Chamkar Mon'));
  perform pg_temp.ok('a blank name reduces to nothing at all',
    app.geo_key('   ') is null and app.geo_key(null) is null);
  perform pg_temp.eq('Khmer survives the trip',
    app.geo_key('ទន្លេបាសាក់'), 'ទន្លេបាសាក់');
  -- Khmer writes the administrative word against the name with nothing
  -- between them, so the Latin rule with its required space cannot see it.
  perform pg_temp.eq('and its prefixes come off, written against the name as they are',
    app.geo_key('សង្កាត់ទន្លេបាសាក់'), app.geo_key('ទន្លេបាសាក់'));
  perform pg_temp.eq('the district one too',
    app.geo_key('ខណ្ឌចំការមន'), app.geo_key('ចំការមន'));

  ----------------------------------------------------------------------------
  -- Matching, and refusing to
  ----------------------------------------------------------------------------
  perform pg_temp.eq('a district matches by its English name',
    app.match_district('TP', 'Chamkar Mon'), 'TP-01');
  perform pg_temp.eq('or by its Khmer one',
    app.match_district('TP', 'ចំការមន'), 'TP-01');
  perform pg_temp.eq('or with the Khmer prefix on it',
    app.match_district('TP', 'ខណ្ឌចំការមន'), 'TP-01');
  perform pg_temp.eq('or as somebody would actually write it',
    app.match_district('TP', 'khan chamkar-mon'), 'TP-01');
  perform pg_temp.ok('a name nobody recognises matches nothing',
    app.match_district('TP', 'Nowhere At All') is null);
  perform pg_temp.ok('and a blank one matches nothing rather than everything',
    app.match_district('TP', '') is null);

  perform pg_temp.eq('a commune is looked for inside its own district',
    app.match_commune('TP-01', 'Tonle Bassac'), 'TP-01-02');
  perform pg_temp.eq('and the same name in the next district is a different place',
    app.match_commune('TP-02', 'Tonle Bassac'), 'TP-02-01');

  ----------------------------------------------------------------------------
  -- What the trigger does on the way in
  ----------------------------------------------------------------------------
  insert into public.users (id, full_name) values (v_rep, 'Geo Rep');

  insert into public.customers (shop_name, owner_id, province_code, district_text, commune_text)
    values ('Geo Shop', v_rep, 'TP', 'Khan Chamkar Mon', 'សង្កាត់ទន្លេបាសាក់')
    returning id into v_id;

  perform pg_temp.eq('a district written as text arrives as a code',
    (select district_code from public.customers where id = v_id), 'TP-01');
  perform pg_temp.eq('and so does the commune, scoped to that district',
    (select commune_code from public.customers where id = v_id), 'TP-01-02');
  perform pg_temp.eq('while the text is kept exactly as it was written',
    (select district_text from public.customers where id = v_id), 'Khan Chamkar Mon');

  ----------------------------------------------------------------------------
  -- What it refuses to do
  ----------------------------------------------------------------------------
  -- Moved by hand to a different district. The commune goes with it — the
  -- geography guard already refuses a commune sitting outside its district —
  -- and what is being tested is that the text does not pull the district back.
  update public.customers
     set district_code = 'TP-02', commune_code = null, commune_text = null
   where id = v_id;
  update public.customers set district_text = 'Chamkar Mon' where id = v_id;
  perform pg_temp.eq('a code already set is never overruled by the text',
    (select district_code from public.customers where id = v_id), 'TP-02');

  insert into public.customers (shop_name, owner_id, province_code, district_text)
    values ('Lost Shop', v_rep, 'TP', 'Somewhere Unwritten') returning id into v_id;
  perform pg_temp.ok('a name that matches nothing leaves the code null',
    (select district_code is null from public.customers where id = v_id));
  perform pg_temp.eq('and keeps the text so nothing is lost',
    (select district_text from public.customers where id = v_id), 'Somewhere Unwritten');
  perform pg_temp.eq('and shows up as needing attention',
    (select count(*)::text from public.customer_geo_unmatched where id = v_id), '1');
  perform pg_temp.ok('flagged on the district, not the commune',
    (select district_unmatched and not commune_unmatched
       from public.customer_geo_unmatched where id = v_id));

  -- A commune sits inside a district; with no district there is nothing to
  -- scope the search to, and every commune name in the country is a candidate.
  insert into public.customers (shop_name, owner_id, commune_text)
    values ('Floating Shop', v_rep, 'Tonle Bassac') returning id into v_id;
  perform pg_temp.ok('a commune with no district is left alone',
    (select commune_code is null from public.customers where id = v_id));

  -- Two districts of the same name in one province is a fault in the reference
  -- data. Picking one at random would hide it.
  insert into public.geo_districts (code, province_code, name, name_alt)
    values ('TP-03', 'TP', 'Chamkar Mon', 'ចំការមន');
  perform pg_temp.ok('an ambiguous name matches nothing at all',
    app.match_district('TP', 'Chamkar Mon') is null);

  raise exception 'GEO OK - % assertions passed', current_setting('higtest.checks');
end;
$$;
