-- inventory.test.sql
--
-- The catalogue's own suite, alongside access_model.test.sql. It is separate
-- because it needs its own fixtures — an accountant, an administrator and a
-- sales rep who holds nothing here — and mixing them into the access suite
-- would make both harder to read than either is now.
--
-- Everything happens inside one transaction that is deliberately rolled back,
-- so a run leaves no trace.
--
--     psql "$DATABASE_URL" -f supabase/tests/inventory.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  INVENTORY OK - 65 assertions passed (rls: ran)
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
    raise exception 'FAILED: % -- expected %, got %',
      p_label, coalesce(p_expected, 'null'), coalesce(p_actual, 'null');
  end if;
end;
$f$;

create or replace function pg_temp.ok(p_label text, p_actual boolean)
returns void language plpgsql as $f$
begin
  perform pg_temp.bump();
  if p_actual is distinct from true then
    raise exception 'FAILED: % -- expected true, got %', p_label, coalesce(p_actual::text, 'null');
  end if;
end;
$f$;

create or replace function pg_temp.rejects(p_label text, p_stmt text)
returns void language plpgsql as $f$
begin
  perform pg_temp.bump();
  begin
    execute p_stmt;
  exception
    when check_violation or not_null_violation or foreign_key_violation
      or unique_violation or raise_exception then
      return;
  end;
  raise exception 'FAILED: % -- statement was accepted but should have been refused', p_label;
end;
$f$;

create or replace function pg_temp.refused(p_label text, p_stmt text)
returns void language plpgsql as $f$
begin
  perform pg_temp.bump();
  begin
    execute p_stmt;
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'FAILED: % -- row level security accepted a statement it should have refused', p_label;
end;
$f$;

create or replace function pg_temp.act_as(p_user uuid)
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end;
$f$;

create or replace function pg_temp.new_user(
  p_id uuid, p_email text, p_name text, p_role_key text
) returns void language plpgsql as $f$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name, 'role_key', p_role_key),
    now(), now(), '', '', '', ''
  );
end;
$f$;

do $$
declare
  v_sa  uuid := '00000000-0000-4000-8000-0000000e0001';  -- super admin
  v_acc uuid := '00000000-0000-4000-8000-0000000e0002';  -- accountant
  v_rep uuid := '00000000-0000-4000-8000-0000000e0003';  -- sales, no inventory
  v_top uuid;   -- a top-level category
  v_sub uuid;   -- its sub-category
  v_alt uuid;   -- a second top-level category
  v_brd uuid;   -- a brand
  v_itm uuid;   -- an item with two variants
  v_pln uuid;   -- an item with one unattributed variant
  v_rls text := 'skipped (cannot assume the authenticated role)';
begin
  perform set_config('higtest.checks', '0', false);

  perform pg_temp.new_user(v_sa,  'ix.sa@example.test',  'Inv Admin', 'system_admin');
  perform pg_temp.new_user(v_acc, 'ix.acc@example.test', 'Inv Acct',  'accounting');
  perform pg_temp.new_user(v_rep, 'ix.rep@example.test', 'Inv Rep',   'sales');
  update public.users set is_super_admin = true where id = v_sa;

  ----------------------------------------------------------------------------
  -- The module is registered and reachable
  ----------------------------------------------------------------------------
  perform pg_temp.eq('inventory module is registered',
    (select href from public.modules where key = 'inventory'), 'inventory');
  perform pg_temp.ok('inventory sits beside product in the matrix',
    (select sort_order from public.modules where key = 'inventory')
      < (select sort_order from public.modules where key = 'sale_order'));
  perform pg_temp.eq('module sort order stayed unique',
    (select count(distinct sort_order)::text from public.modules),
    (select count(*)::text from public.modules));
  perform pg_temp.eq('inventory appears in two views',
    (select count(*)::text from public.view_modules where module_key = 'inventory'), '2');

  ----------------------------------------------------------------------------
  -- Who holds what
  ----------------------------------------------------------------------------
  perform pg_temp.eq('accountant: inventory.view', app.effective_scope(v_acc, 'inventory', 'view')::text,   'any');
  perform pg_temp.eq('accountant: inventory.add',  app.effective_scope(v_acc, 'inventory', 'add')::text,    'any');
  perform pg_temp.eq('accountant: inventory.edit', app.effective_scope(v_acc, 'inventory', 'edit')::text,   'any');
  perform pg_temp.eq('accountant: no delete',      app.effective_scope(v_acc, 'inventory', 'delete')::text, null);
  perform pg_temp.eq('super admin: inventory.delete', app.effective_scope(v_sa, 'inventory', 'delete')::text, 'any');
  perform pg_temp.eq('sales: no inventory at all', app.effective_scope(v_rep, 'inventory', 'view')::text,   null);

  ----------------------------------------------------------------------------
  -- Categories go exactly one level deep
  ----------------------------------------------------------------------------
  insert into public.item_categories (name_en) values ('IX Grocery') returning id into v_top;
  insert into public.item_categories (name_en) values ('IX Hardware') returning id into v_alt;
  insert into public.item_categories (parent_id, name_en) values (v_top, 'IX Drinks')
    returning id into v_sub;

  perform pg_temp.eq('a sub-category knows its parent',
    (select parent_id::text from public.item_categories where id = v_sub), v_top::text);

  perform pg_temp.rejects('a sub-category may not have children of its own',
    format('insert into public.item_categories (parent_id, name_en) values (%L, ''IX Water'')', v_sub));
  perform pg_temp.rejects('a category with children may not be moved under another',
    format('update public.item_categories set parent_id = %L where id = %L', v_alt, v_top));
  perform pg_temp.rejects('a category may not be its own parent',
    format('update public.item_categories set parent_id = %L where id = %L', v_alt, v_alt));

  -- Moving a childless category is ordinary, and must still work.
  update public.item_categories set parent_id = v_alt where id = v_sub;
  perform pg_temp.eq('a childless sub-category can be re-parented',
    (select parent_id::text from public.item_categories where id = v_sub), v_alt::text);
  update public.item_categories set parent_id = v_top where id = v_sub;

  perform pg_temp.rejects('two top categories may not share a name',
    'insert into public.item_categories (name_en) values (''ix grocery'')');
  perform pg_temp.rejects('two siblings may not share a name',
    format('insert into public.item_categories (parent_id, name_en) values (%L, ''IX DRINKS'')', v_top));
  -- The same name under a different parent is ordinary.
  insert into public.item_categories (parent_id, name_en) values (v_alt, 'IX Drinks');
  perform pg_temp.eq('the same name may sit under two different parents',
    (select count(*)::text from public.item_categories where lower(name_en) = 'ix drinks'), '2');

  perform pg_temp.rejects('a category needs an English name',
    'insert into public.item_categories (name_en) values (''   '')');
  perform pg_temp.rejects('a blank Khmer name is not a Khmer name',
    'insert into public.item_categories (name_en, name_km) values (''IX Blank KM'', ''   '')');

  -- Bilingual, exactly as an item is: English required, Khmer optional.
  update public.item_categories set name_km = 'ភេសជ្ជៈ' where id = v_sub;
  perform pg_temp.eq('a category keeps its Khmer name',
    (select name_km from public.item_categories where id = v_sub), 'ភេសជ្ជៈ');
  perform pg_temp.eq('and a category without one is not required to have it',
    (select coalesce(name_km, 'none') from public.item_categories where id = v_alt), 'none');

  -- Uniqueness keys on the English name, so the Khmer one may repeat: two
  -- different English categories can share a Khmer word without either being
  -- a data-entry slip.
  insert into public.item_categories (name_en, name_km) values ('IX Beverages', 'ភេសជ្ជៈ');
  perform pg_temp.eq('the same Khmer name may sit on two categories',
    (select count(*)::text from public.item_categories where name_km = 'ភេសជ្ជៈ'), '2');

  ----------------------------------------------------------------------------
  -- Brands
  ----------------------------------------------------------------------------
  insert into public.brands (name, description) values ('IX Angkor', 'A test brand')
    returning id into v_brd;
  perform pg_temp.rejects('two brands may not share a name',
    'insert into public.brands (name) values (''ix angkor'')');
  perform pg_temp.rejects('a brand needs a name',
    'insert into public.brands (name) values ('' '')');
  perform pg_temp.ok('a brand starts active',
    (select active from public.brands where id = v_brd));

  ----------------------------------------------------------------------------
  -- Items
  ----------------------------------------------------------------------------
  insert into public.items (code, name_en, name_km, category_id, brand_id)
    values ('IX-001', 'Drinking Water', 'ទឹកសុទ្ធ', v_sub, v_brd)
    returning id into v_itm;

  perform pg_temp.eq('an item keeps its Khmer name',
    (select name_km from public.items where id = v_itm), 'ទឹកសុទ្ធ');
  perform pg_temp.rejects('an item needs an English name',
    'insert into public.items (name_en) values (''  '')');
  perform pg_temp.rejects('a blank Khmer name is not a Khmer name',
    'insert into public.items (name_en, name_km) values (''IX Blank'', ''   '')');
  perform pg_temp.rejects('two items may not share a code',
    'insert into public.items (code, name_en) values (''ix-001'', ''IX Other'')');
  -- A missing code is not a duplicate of another missing code.
  insert into public.items (name_en) values ('IX Uncoded One');
  insert into public.items (name_en) values ('IX Uncoded Two');
  perform pg_temp.eq('items without a code do not collide',
    (select count(*)::text from public.items where code is null and name_en like 'IX Uncoded%'), '2');

  -- A brand is optional; a category is optional.
  insert into public.items (name_en) values ('IX Unbranded') returning id into v_pln;

  ----------------------------------------------------------------------------
  -- Variants carry the price and the picture
  ----------------------------------------------------------------------------
  insert into public.item_variants (item_id, attribute_name, attribute_value, price_usd, price_khr, photo_path, sort_order)
    values (v_itm, 'Size', '500 ml', 0.50, 2000, 'items/a/500.jpg', 1);
  insert into public.item_variants (item_id, attribute_name, attribute_value, price_usd, price_khr, photo_path, sort_order)
    values (v_itm, 'Size', '1.5 L', 1.25, 5000, 'items/a/1500.jpg', 2);

  -- The plain item: one row, no attribute, which is where its price lives.
  insert into public.item_variants (item_id, price_usd, price_khr) values (v_pln, 3.00, 12000);

  perform pg_temp.rejects('an attribute name without a value is unfinished',
    format('insert into public.item_variants (item_id, attribute_name) values (%L, ''Colour'')', v_pln));
  perform pg_temp.rejects('a value without a name reads as nothing',
    format('insert into public.item_variants (item_id, attribute_value) values (%L, ''Blue'')', v_pln));
  perform pg_temp.rejects('a price may not be negative in dollars',
    format('insert into public.item_variants (item_id, attribute_name, attribute_value, price_usd)
              values (%L, ''Colour'', ''Blue'', -1)', v_pln));
  perform pg_temp.rejects('nor in riel',
    format('insert into public.item_variants (item_id, attribute_name, attribute_value, price_khr)
              values (%L, ''Colour'', ''Blue'', -1)', v_pln));
  perform pg_temp.rejects('the same attribute may not appear twice on one item',
    format('insert into public.item_variants (item_id, attribute_name, attribute_value)
              values (%L, ''size'', ''500 ML'')', v_itm));
  perform pg_temp.rejects('nor may an item have two unattributed rows',
    format('insert into public.item_variants (item_id, price_usd) values (%L, 9)', v_pln));
  -- The same attribute on a different item is ordinary.
  insert into public.item_variants (item_id, attribute_name, attribute_value, price_usd)
    values (v_pln, 'Size', '500 ml', 0.60);

  perform pg_temp.eq('riel is stored whole',
    (select price_khr::text from public.item_variants
      where item_id = v_itm and attribute_value = '500 ml'), '2000');
  perform pg_temp.eq('dollars keep their cents',
    (select price_usd::text from public.item_variants
      where item_id = v_itm and attribute_value = '500 ml'), '0.50');

  ----------------------------------------------------------------------------
  -- The catalogue view
  ----------------------------------------------------------------------------
  perform pg_temp.eq('the catalogue counts an item''s variants',
    (select variant_count::text from public.item_catalogue where id = v_itm), '2');
  perform pg_temp.eq('and reports the price range in dollars',
    (select min_price_usd::text || '-' || max_price_usd::text
       from public.item_catalogue where id = v_itm), '0.50-1.25');
  perform pg_temp.eq('and in riel',
    (select min_price_khr::text || '-' || max_price_khr::text
       from public.item_catalogue where id = v_itm), '2000-5000');
  perform pg_temp.eq('it names the category and its parent',
    (select category_parent_name_en || ' / ' || category_name_en
       from public.item_catalogue where id = v_itm), 'IX Grocery / IX Drinks');
  perform pg_temp.eq('and carries the category''s Khmer name through',
    (select category_name_km from public.item_catalogue where id = v_itm), 'ភេសជ្ជៈ');
  perform pg_temp.eq('it names the brand',
    (select brand_name from public.item_catalogue where id = v_itm), 'IX Angkor');
  perform pg_temp.eq('the first picture stands for the item',
    (select photo_path from public.item_catalogue where id = v_itm), 'items/a/500.jpg');
  perform pg_temp.eq('an item with no brand still appears',
    (select name_en from public.item_catalogue where id = v_pln), 'IX Unbranded');

  -- A deactivated variant leaves the price range, because it is not for sale.
  update public.item_variants set active = false
    where item_id = v_itm and attribute_value = '1.5 L';
  perform pg_temp.eq('a deactivated variant leaves the range',
    (select max_price_usd::text from public.item_catalogue where id = v_itm), '0.50');
  update public.item_variants set active = true
    where item_id = v_itm and attribute_value = '1.5 L';

  ----------------------------------------------------------------------------
  -- References hold
  ----------------------------------------------------------------------------
  perform pg_temp.rejects('a category in use cannot be deleted',
    format('delete from public.item_categories where id = %L', v_sub));
  perform pg_temp.rejects('nor a brand in use',
    format('delete from public.brands where id = %L', v_brd));

  ----------------------------------------------------------------------------
  -- Pictures
  ----------------------------------------------------------------------------
  perform pg_temp.ok('the inventory bucket exists and is private',
    (select not public from storage.buckets where id = 'inventory'));

  ----------------------------------------------------------------------------
  -- Row level security
  ----------------------------------------------------------------------------
  begin
    execute 'set local role authenticated';

    perform pg_temp.act_as(v_rep);
    perform pg_temp.eq('a sales rep sees no items at all',
      (select count(*)::text from public.items), '0');
    perform pg_temp.eq('nor any brands',
      (select count(*)::text from public.brands), '0');
    perform pg_temp.eq('nor the catalogue',
      (select count(*)::text from public.item_catalogue), '0');
    perform pg_temp.refused('and may not create an item',
      'insert into public.items (name_en) values (''IX Sneaked In'')');

    perform pg_temp.act_as(v_acc);
    perform pg_temp.ok('an accountant sees the catalogue',
      (select count(*) from public.items) >= 4);
    insert into public.items (name_en, name_km) values ('IX Accountant Made', 'ធ្វើ');
    perform pg_temp.eq('and may create an item',
      (select count(*)::text from public.items where name_en = 'IX Accountant Made'), '1');
    update public.items set name_en = 'IX Accountant Fixed' where name_en = 'IX Accountant Made';
    perform pg_temp.eq('and may correct one',
      (select count(*)::text from public.items where name_en = 'IX Accountant Fixed'), '1');
    update public.item_variants set price_usd = 0.55
      where item_id = v_itm and attribute_value = '500 ml';
    perform pg_temp.eq('and may reprice one',
      (select price_usd::text from public.item_variants
        where item_id = v_itm and attribute_value = '500 ml'), '0.55');
    insert into public.item_categories (name_en) values ('IX Accountant Category');
    perform pg_temp.eq('and may add a category',
      (select count(*)::text from public.item_categories where name_en = 'IX Accountant Category'), '1');

    -- A refused delete matches no rows and raises nothing, so the count is what
    -- proves it was refused.
    delete from public.items where name_en = 'IX Accountant Fixed';
    perform pg_temp.eq('but may not destroy one',
      (select count(*)::text from public.items where name_en = 'IX Accountant Fixed'), '1');
    delete from public.brands where id = v_brd;
    perform pg_temp.eq('nor a brand',
      (select count(*)::text from public.brands where id = v_brd), '1');

    perform pg_temp.act_as(v_sa);
    delete from public.items where name_en = 'IX Accountant Fixed';
    perform pg_temp.eq('an administrator may destroy one',
      (select count(*)::text from public.items where name_en = 'IX Accountant Fixed'), '0');

    -- Deleting an item takes its prices with it; leaving orphaned variants
    -- would leave prices in the system for something nobody can name.
    delete from public.items where id = v_itm;
    perform pg_temp.eq('and its variants go with it',
      (select count(*)::text from public.item_variants where item_id = v_itm), '0');

    -- The depth guard runs as definer, so it still bites under a policy.
    perform pg_temp.rejects('the one-level rule holds under RLS too',
      format('insert into public.item_categories (parent_id, name_en) values (%L, ''IX Too Deep'')', v_sub));

    execute 'reset role';
    v_rls := 'ran';
  exception when insufficient_privilege then
    execute 'reset role';
    v_rls := 'skipped (cannot assume the authenticated role)';
  end;

  raise exception 'INVENTORY OK - % assertions passed (rls: %)',
    current_setting('higtest.checks'), v_rls;
end;
$$;
