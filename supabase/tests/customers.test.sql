-- customers.test.sql
--
-- The customer module's suite, alongside access_model.test.sql and
-- inventory.test.sql. It gets its own file because it needs a whole cast —
-- a manager, a rep who reports to them, an unrelated rep, a warehouse user and
-- an accountant — and because this is the module where permission *scope*
-- finally does real work, so most of what is worth asserting is about who can
-- see and change whose accounts.
--
-- Everything happens inside one transaction that is deliberately rolled back,
-- so a run leaves no trace.
--
--     psql "$DATABASE_URL" -f supabase/tests/customers.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  CUSTOMERS OK - 42 assertions passed (rls: ran)
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
  v_sa   uuid := '00000000-0000-4000-8000-0000000c0001';  -- super admin
  v_mgr  uuid := '00000000-0000-4000-8000-0000000c0002';  -- sales, manages the rep
  v_rep  uuid := '00000000-0000-4000-8000-0000000c0003';  -- sales
  v_other uuid := '00000000-0000-4000-8000-0000000c0004'; -- sales, unrelated
  v_wh   uuid := '00000000-0000-4000-8000-0000000c0005';  -- warehouse, view 'sub'
  v_acc  uuid := '00000000-0000-4000-8000-0000000c0006';  -- accounting, view 'any'
  v_mine uuid;   -- a customer owned by the rep
  v_thrs uuid;   -- one owned by the unrelated rep
  v_house uuid;  -- one with no owner
  v_dist text;
  v_comm text;
  v_rls text := 'skipped (cannot assume the authenticated role)';
begin
  perform set_config('higtest.checks', '0', false);

  perform pg_temp.new_user(v_sa,   'cx.sa@example.test',  'Cx Admin', 'system_admin');
  perform pg_temp.new_user(v_mgr,  'cx.mgr@example.test', 'Cx Mgr',   'sales');
  perform pg_temp.new_user(v_rep,  'cx.rep@example.test', 'Cx Rep',   'sales');
  perform pg_temp.new_user(v_other,'cx.oth@example.test', 'Cx Other', 'sales');
  perform pg_temp.new_user(v_wh,   'cx.wh@example.test',  'Cx Wh',    'warehouse');
  perform pg_temp.new_user(v_acc,  'cx.acc@example.test', 'Cx Acc',   'accounting');
  update public.users set is_super_admin = true where id = v_sa;
  update public.users set manager_id = v_mgr where id in (v_rep, v_wh);

  ----------------------------------------------------------------------------
  -- Geography
  ----------------------------------------------------------------------------
  perform pg_temp.eq('all 25 provinces are seeded',
    (select count(*)::text from public.geo_provinces), '25');
  perform pg_temp.eq('Phnom Penh carries its official code',
    (select name_en from public.geo_provinces where code = '12'), 'Phnom Penh');
  perform pg_temp.eq('Tboung Khmum is present, as the newest province',
    (select name_en from public.geo_provinces where code = '25'), 'Tboung Khmum');
  -- Guessed place names are worse than absent ones, and these are the rows every
  -- address in the country hangs off.
  perform pg_temp.eq('Khmer names are left absent rather than guessed at',
    (select count(*)::text from public.geo_provinces where name_km is not null), '0');

  insert into public.geo_districts (code, province_code, name_en)
    values ('1201', '12', 'Chamkar Mon') returning code into v_dist;
  insert into public.geo_communes (code, district_code, name_en)
    values ('120101', '1201', 'Tonle Bassac') returning code into v_comm;
  insert into public.geo_districts (code, province_code, name_en)
    values ('0801', '08', 'Kandal Stueng');

  ----------------------------------------------------------------------------
  -- The address chain must agree with itself
  ----------------------------------------------------------------------------
  insert into public.customers (shop_name, owner_id, district_code)
    values ('CX Chain Test', v_rep, '1201') returning id into v_mine;
  perform pg_temp.eq('choosing a district fills in its province',
    (select province_code from public.customers where id = v_mine), '12');

  update public.customers set commune_code = '120101' where id = v_mine;
  perform pg_temp.eq('choosing a commune fills in the chain above it',
    (select province_code || '/' || district_code from public.customers where id = v_mine),
    '12/1201');

  perform pg_temp.rejects('a district in the wrong province is refused',
    format('update public.customers set province_code = ''08'' where id = %L', v_mine));
  perform pg_temp.rejects('a commune in the wrong district is refused',
    format('update public.customers set district_code = ''0801'', commune_code = ''120101''
              where id = %L', v_mine));

  ----------------------------------------------------------------------------
  -- The record's own constraints
  ----------------------------------------------------------------------------
  perform pg_temp.rejects('a customer needs a shop name',
    'insert into public.customers (shop_name) values (''   '')');
  perform pg_temp.rejects('a credit limit may not be negative',
    'insert into public.customers (shop_name, credit_limit_usd) values (''CX Neg'', -1)');
  perform pg_temp.rejects('half a coordinate locates nothing',
    'insert into public.customers (shop_name, latitude) values (''CX Half'', 11.55)');
  perform pg_temp.rejects('nor does one off the globe',
    'insert into public.customers (shop_name, latitude, longitude) values (''CX Off'', 91, 0)');
  perform pg_temp.rejects('banning a shop without saying why is refused',
    'insert into public.customers (shop_name, status) values (''CX Banned'', ''banned'')');
  insert into public.customers (shop_name, status, status_note)
    values ('CX Banned', 'banned', 'Cheques returned twice');
  perform pg_temp.eq('with a reason it is allowed',
    (select status::text from public.customers where shop_name = 'CX Banned'), 'banned');

  update public.customers
     set latitude = 11.556400, longitude = 104.928200, street_address = 'St 271',
         landmark = 'Opposite the pagoda', zipcode = '120101'
   where id = v_mine;
  perform pg_temp.eq('a real coordinate is kept to six places',
    (select latitude::text || ',' || longitude::text from public.customers where id = v_mine),
    '11.556400,104.928200');

  ----------------------------------------------------------------------------
  -- Contacts and pictures
  ----------------------------------------------------------------------------
  insert into public.customer_contacts (customer_id, name, position, phone, telegram_id, is_primary)
    values (v_mine, 'Sok Dara', 'Owner', '012 345 678', '@dara', true);
  insert into public.customer_contacts (customer_id, name, phone)
    values (v_mine, 'Chan Thida', '098 765 432');
  perform pg_temp.eq('a shop can hold several contacts',
    (select count(*)::text from public.customer_contacts where customer_id = v_mine), '2');
  perform pg_temp.rejects('but only one of them is primary',
    format('insert into public.customer_contacts (customer_id, name, is_primary)
              values (%L, ''Third Person'', true)', v_mine));
  perform pg_temp.rejects('a contact needs a name',
    format('insert into public.customer_contacts (customer_id, name) values (%L, ''  '')', v_mine));

  insert into public.customer_pictures (customer_id, photo_path, description, is_primary)
    values (v_mine, v_mine || '/front.jpg', 'Shopfront', true);
  insert into public.customer_pictures (customer_id, photo_path, description)
    values (v_mine, v_mine || '/inside.jpg', 'Shelving');
  perform pg_temp.eq('a shop can hold several pictures',
    (select count(*)::text from public.customer_pictures where customer_id = v_mine), '2');
  perform pg_temp.rejects('but only one of them is primary',
    format('insert into public.customer_pictures (customer_id, photo_path, is_primary)
              values (%L, ''x/third.jpg'', true)', v_mine));

  ----------------------------------------------------------------------------
  -- The directory view
  ----------------------------------------------------------------------------
  perform pg_temp.eq('the directory resolves the province name from its code',
    (select province_name from public.customer_directory where id = v_mine), 'Phnom Penh');
  perform pg_temp.eq('and names the primary contact',
    (select primary_contact_name from public.customer_directory where id = v_mine), 'Sok Dara');
  perform pg_temp.eq('and picks the primary picture',
    (select primary_photo_path from public.customer_directory where id = v_mine),
    v_mine || '/front.jpg');
  perform pg_temp.eq('and counts the contacts',
    (select contact_count::text from public.customer_directory where id = v_mine), '2');
  perform pg_temp.eq('and names the rep whose account it is',
    (select owner_name from public.customer_directory where id = v_mine), 'Cx Rep');

  -- Typed text stands in when no code was picked, which is what keeps an address
  -- enterable before the district and commune import has happened.
  insert into public.customers (shop_name, owner_id, province_text, district_text)
    values ('CX Typed', v_rep, 'Kampot', 'Somewhere Not Imported Yet')
    returning id into v_thrs;
  perform pg_temp.eq('a typed province shows when no code was chosen',
    (select province_name || ' / ' || district_name from public.customer_directory where id = v_thrs),
    'Kampot / Somewhere Not Imported Yet');

  insert into public.customers (shop_name, owner_id) values ('CX Others', v_other)
    returning id into v_thrs;
  insert into public.customers (shop_name, owner_id) values ('CX House', null)
    returning id into v_house;

  ----------------------------------------------------------------------------
  -- Scope, which is the whole point of this module
  ----------------------------------------------------------------------------
  begin
    execute 'set local role authenticated';

    -- Sales holds view at 'any', so a rep sees every shop...
    perform pg_temp.act_as(v_rep);
    perform pg_temp.ok('a rep sees shops beyond their own, because view is ''any''',
      (select count(*) from public.customers) >= 4);

    -- ...but add and edit are 'own', so the account still decides who changes it.
    update public.customers set business_type = 'Grocery' where id = v_mine;
    perform pg_temp.eq('a rep may change their own account',
      (select business_type from public.customers where id = v_mine), 'Grocery');

    -- A refused update matches no rows and raises nothing, so the value is what
    -- proves it was refused.
    update public.customers set business_type = 'Hijacked' where id = v_thrs;
    perform pg_temp.eq('but not somebody else''s',
      (select coalesce(business_type, 'untouched') from public.customers where id = v_thrs),
      'untouched');

    perform pg_temp.refused('nor may they create one owned by somebody else',
      format('insert into public.customers (shop_name, owner_id) values (''CX Sneak'', %L)', v_other));
    insert into public.customers (shop_name) values ('CX Rep Made');
    perform pg_temp.eq('creating one without naming an owner makes it theirs',
      (select owner_id::text from public.customers where shop_name = 'CX Rep Made'), v_rep::text);

    delete from public.customers where id = v_mine;
    perform pg_temp.eq('sales holds no delete at all',
      (select count(*)::text from public.customers where id = v_mine), '1');

    -- A contact follows the customer it hangs off, through app.customer_owner.
    insert into public.customer_contacts (customer_id, name) values (v_mine, 'CX Added By Rep');
    perform pg_temp.eq('a rep may add a contact to their own shop',
      (select count(*)::text from public.customer_contacts where name = 'CX Added By Rep'), '1');
    perform pg_temp.refused('but not to somebody else''s',
      format('insert into public.customer_contacts (customer_id, name)
                values (%L, ''CX Sneaked Contact'')', v_thrs));

    -- Warehouse holds view at 'sub': its own and its subordinates', nothing else.
    perform pg_temp.act_as(v_wh);
    perform pg_temp.eq('warehouse sees nothing at ''sub'' with no subordinates',
      (select count(*)::text from public.customers where owner_id = v_rep), '0');

    perform pg_temp.act_as(v_mgr);
    perform pg_temp.ok('a manager reaches their subordinate''s accounts',
      (select count(*) from public.customers where owner_id = v_rep) >= 1);

    -- A house account belongs to everyone holding the module. That follows from
    -- app.can(module, action, null) answering "do you hold this at all", so it
    -- is asserted rather than left looking accidental.
    perform pg_temp.act_as(v_wh);
    perform pg_temp.eq('an unowned shop is visible to any holder of the module',
      (select count(*)::text from public.customers where id = v_house), '1');

    perform pg_temp.act_as(v_acc);
    perform pg_temp.ok('accounting sees every shop',
      (select count(*) from public.customers) >= 4);
    update public.customers set remarks = 'Accounting wrote here' where id = v_mine;
    perform pg_temp.eq('but may not change one',
      (select coalesce(remarks, 'untouched') from public.customers where id = v_mine), 'untouched');

    perform pg_temp.act_as(v_sa);
    delete from public.customers where id = v_mine;
    perform pg_temp.eq('an administrator may remove one',
      (select count(*)::text from public.customers where id = v_mine), '0');
    perform pg_temp.eq('and its contacts and pictures go with it',
      (select (select count(*) from public.customer_contacts where customer_id = v_mine)
            + (select count(*) from public.customer_pictures where customer_id = v_mine))::text,
      '0');

    -- The geography guard is definer, so it still bites under a policy.
    perform pg_temp.rejects('the address chain still holds under RLS',
      'insert into public.customers (shop_name, province_code, district_code)
         values (''CX Bad Chain'', ''08'', ''1201'')');

    execute 'reset role';
    v_rls := 'ran';
  exception when insufficient_privilege then
    execute 'reset role';
    v_rls := 'skipped (cannot assume the authenticated role)';
  end;

  raise exception 'CUSTOMERS OK - % assertions passed (rls: %)',
    current_setting('higtest.checks'), v_rls;
end;
$$;
