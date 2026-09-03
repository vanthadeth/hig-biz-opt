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
--     ERROR:  INVENTORY OK - 84 assertions passed (rls: ran)
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
  v_pln uuid;   -- an item with one bare variant
  v_fbk uuid;   -- an item whose only picture is on a variant
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
  insert into public.items (name_en, name_km, category_id, brand_id)
    values ('Drinking Water', 'ទឹកសុទ្ធ', v_sub, v_brd)
    returning id into v_itm;

  perform pg_temp.eq('an item keeps its Khmer name',
    (select name_km from public.items where id = v_itm), 'ទឹកសុទ្ធ');
  perform pg_temp.rejects('an item needs an English name',
    'insert into public.items (name_en) values (''  '')');
  perform pg_temp.rejects('a blank Khmer name is not a Khmer name',
    'insert into public.items (name_en, name_km) values (''IX Blank'', ''   '')');

  ----------------------------------------------------------------------------
  -- The item carries the code and the price
  --
  -- 0028 moved both back up from the variant. HIG prices one item one way, and
  -- a price per variant made every screen report a range where a single figure
  -- was meant. The code is unique across the whole catalogue rather than within
  -- one category: a code that identifies two different things is not an
  -- identifier.
  ----------------------------------------------------------------------------
  update public.items set code = 'IX-001', price_usd = 0.50, price_khr = 2000
    where id = v_itm;

  perform pg_temp.eq('riel is stored whole',
    (select price_khr::text from public.items where id = v_itm), '2000');
  perform pg_temp.eq('dollars keep their cents',
    (select price_usd::text from public.items where id = v_itm), '0.50');
  perform pg_temp.rejects('a price may not be negative in dollars',
    'insert into public.items (name_en, price_usd) values (''IX Negative'', -1)');
  perform pg_temp.rejects('nor in riel',
    'insert into public.items (name_en, price_khr) values (''IX Negative'', -1)');
  perform pg_temp.rejects('a blank code is not a code',
    'insert into public.items (name_en, code) values (''IX Blank Code'', ''   '')');
  perform pg_temp.rejects('a code may not be reused on another item',
    'insert into public.items (name_en, code) values (''IX Clash'', ''IX-001'')');
  perform pg_temp.rejects('and case does not make it a different code',
    'insert into public.items (name_en, code) values (''IX Clash'', ''ix-001'')');
  -- Two absent codes are not a clash: the unique index skips nulls, which is
  -- what lets most of a catalogue be entered before anybody assigns codes.
  insert into public.items (name_en) values ('IX Uncoded One');
  insert into public.items (name_en) values ('IX Uncoded Two');
  perform pg_temp.eq('items without a code do not collide',
    (select count(*)::text from public.items
      where code is null and name_en like 'IX Uncoded%'), '2');

  -- A brand is optional; a category is optional.
  insert into public.items (name_en) values ('IX Unbranded') returning id into v_pln;

  ----------------------------------------------------------------------------
  -- Variants describe: the size, the colour, the picture
  --
  -- The barcode stays on the variant deliberately. It is the one identifier
  -- that genuinely differs between a 500 ml bottle and a 1.5 L one, because it
  -- is assigned to the physical package rather than to the product. It is
  -- unique across the whole catalogue, because a barcode names a product to the
  -- world rather than only to us.
  ----------------------------------------------------------------------------
  perform pg_temp.eq('a variant carries neither a code nor a price of its own',
    (select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name = 'item_variants'
        and column_name in ('code', 'price_usd', 'price_khr')), '0');

  insert into public.item_variants (item_id, property_name, property_value, barcode,
                                    photo_path, sort_order)
    values (v_itm, 'Size', '500 ml', '8850000000001', 'items/a/500.jpg', 1);
  insert into public.item_variants (item_id, property_name, property_value, barcode,
                                    photo_path, sort_order)
    values (v_itm, 'Size', '1.5 L', '8850000000002', 'items/a/1500.jpg', 2);

  -- The plain item: one bare row, which is the item in the single form it
  -- comes in rather than a variation of it.
  insert into public.item_variants (item_id) values (v_pln);

  perform pg_temp.rejects('a property name without a value is unfinished',
    format('insert into public.item_variants (item_id, property_name) values (%L, ''Colour'')', v_pln));
  perform pg_temp.rejects('a value without a name reads as nothing',
    format('insert into public.item_variants (item_id, property_value) values (%L, ''Blue'')', v_pln));
  perform pg_temp.rejects('the same property may not appear twice on one item',
    format('insert into public.item_variants (item_id, property_name, property_value)
              values (%L, ''size'', ''500 ML'')', v_itm));
  perform pg_temp.rejects('nor may an item have two bare rows',
    format('insert into public.item_variants (item_id) values (%L)', v_pln));
  -- The same property on a different item is ordinary.
  insert into public.item_variants (item_id, property_name, property_value)
    values (v_pln, 'Size', '500 ml');

  perform pg_temp.rejects('a barcode may not be reused on a sibling variant',
    format('insert into public.item_variants (item_id, property_name, property_value, barcode)
              values (%L, ''Size'', ''2 L'', ''8850000000001'')', v_itm));
  perform pg_temp.rejects('nor on a different item',
    format('insert into public.item_variants (item_id, barcode)
              values (%L, ''8850000000001'')', v_pln));
  perform pg_temp.rejects('a blank barcode is not a barcode',
    format('insert into public.item_variants (item_id, barcode) values (%L, ''   '')', v_pln));
  -- The plain item already carries two variants with no barcode at all.
  perform pg_temp.eq('variants without a barcode do not collide',
    (select count(*)::text from public.item_variants
      where barcode is null and item_id = v_pln), '2');

  ----------------------------------------------------------------------------
  -- Item pictures
  --
  -- Several per item, one of them primary. The picture that stands for an item
  -- belongs to the item; a variant's photo is the narrower thing, that
  -- particular size or colour.
  ----------------------------------------------------------------------------
  insert into public.item_pictures (item_id, photo_path, description, is_primary, sort_order)
    values (v_itm, 'items/a/hero.jpg', 'On the shelf', true, 1);
  insert into public.item_pictures (item_id, photo_path, sort_order)
    values (v_itm, 'items/a/back.jpg', 2);

  perform pg_temp.ok('a picture is not primary unless it is said to be',
    (select not is_primary from public.item_pictures where photo_path = 'items/a/back.jpg'));
  perform pg_temp.rejects('a picture needs a path',
    format('insert into public.item_pictures (item_id, photo_path) values (%L, ''   '')', v_itm));
  perform pg_temp.rejects('a blank caption is not a caption',
    format('insert into public.item_pictures (item_id, photo_path, description)
              values (%L, ''items/a/x.jpg'', ''  '')', v_itm));
  -- The partial unique index, which is what stops a form that ticks a second
  -- box without clearing the first from leaving two.
  perform pg_temp.rejects('an item may not have two main pictures',
    format('insert into public.item_pictures (item_id, photo_path, is_primary)
              values (%L, ''items/a/second-main.jpg'', true)', v_itm));
  insert into public.item_pictures (item_id, photo_path, is_primary)
    values (v_pln, 'items/b/hero.jpg', true);
  perform pg_temp.eq('but two items may each have one',
    (select count(*)::text from public.item_pictures where is_primary), '2');

  -- An item with a variant photo but no picture of its own. The variant's photo
  -- stands in, so nothing entered before 0029 stops showing.
  insert into public.items (name_en) values ('IX Photo Fallback') returning id into v_fbk;
  insert into public.item_variants (item_id, photo_path)
    values (v_fbk, 'items/c/only.jpg');

  ----------------------------------------------------------------------------
  -- The catalogue view
  ----------------------------------------------------------------------------
  perform pg_temp.eq('the catalogue counts an item''s variants',
    (select variant_count::text from public.item_catalogue where id = v_itm), '2');
  -- One figure per currency, not a span: the price belongs to the item now, so
  -- there is nothing left to take a range across.
  perform pg_temp.eq('and reports the item''s one price in dollars',
    (select price_usd::text from public.item_catalogue where id = v_itm), '0.50');
  perform pg_temp.eq('and in riel',
    (select price_khr::text from public.item_catalogue where id = v_itm), '2000');
  perform pg_temp.eq('the catalogue no longer reports a price range',
    (select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name = 'item_catalogue'
        and column_name in ('min_price_usd', 'max_price_usd',
                            'min_price_khr', 'max_price_khr')), '0');
  perform pg_temp.eq('it names the category and its parent',
    (select category_parent_name_en || ' / ' || category_name_en
       from public.item_catalogue where id = v_itm), 'IX Grocery / IX Drinks');
  perform pg_temp.eq('and carries the category''s Khmer name through',
    (select category_name_km from public.item_catalogue where id = v_itm), 'ភេសជ្ជៈ');
  perform pg_temp.eq('it names the brand',
    (select brand_name from public.item_catalogue where id = v_itm), 'IX Angkor');
  -- One string per item holding its own code and every barcode under it, which
  -- is what lets the list find an item by a barcode belonging to one of its
  -- variants without fetching every variant first.
  perform pg_temp.eq('it collects the item code and every barcode beneath it',
    (select codes from public.item_catalogue where id = v_itm),
    'IX-001 8850000000001 8850000000002');
  -- The item's own main picture leads, even though its variants have photos of
  -- their own: the bottle on a white background is what belongs in a list.
  perform pg_temp.eq('the item''s main picture stands for it',
    (select photo_path from public.item_catalogue where id = v_itm), 'items/a/hero.jpg');
  perform pg_temp.eq('and a variant''s photo stands in when it has none',
    (select photo_path from public.item_catalogue where id = v_fbk), 'items/c/only.jpg');
  perform pg_temp.eq('an item with no brand still appears',
    (select name_en from public.item_catalogue where id = v_pln), 'IX Unbranded');

  -- A deactivated variant drops out of the count and takes its barcode with it,
  -- because nothing is being sold under it any more.
  update public.item_variants set active = false
    where item_id = v_itm and property_value = '1.5 L';
  perform pg_temp.eq('a deactivated variant leaves the count',
    (select variant_count::text from public.item_catalogue where id = v_itm), '1');
  perform pg_temp.eq('and its barcode leaves the search string',
    (select codes from public.item_catalogue where id = v_itm),
    'IX-001 8850000000001');
  perform pg_temp.eq('but the item keeps its own price and code',
    (select code || ' ' || price_usd::text from public.item_catalogue where id = v_itm),
    'IX-001 0.50');
  update public.item_variants set active = true
    where item_id = v_itm and property_value = '1.5 L';

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
    perform pg_temp.eq('nor any pictures of stock',
      (select count(*)::text from public.item_pictures), '0');
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
    update public.items set price_usd = 0.55 where id = v_itm;
    perform pg_temp.eq('and may reprice one',
      (select price_usd::text from public.items where id = v_itm), '0.55');
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

    -- Deleting an item takes its variants with it; leaving them orphaned would
    -- leave barcodes in the system for something nobody can name.
    delete from public.items where id = v_itm;
    perform pg_temp.eq('and its variants go with it',
      (select count(*)::text from public.item_variants where item_id = v_itm), '0');
    perform pg_temp.eq('and its pictures too',
      (select count(*)::text from public.item_pictures where item_id = v_itm), '0');

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
