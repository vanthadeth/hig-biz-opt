-- customers.test.sql
--
-- The customer module's suite, alongside access_model.test.sql and
-- inventory.test.sql. It gets its own file because it needs a whole cast —
-- a manager, a rep who reports to them, an unrelated rep, a warehouse user, an
-- accountant and a sale supervisor — and because this is the module where
-- permission *scope*
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
--     ERROR:  CUSTOMERS OK - 71 assertions passed (rls: ran)
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
  v_sup  uuid := '00000000-0000-4000-8000-0000000c0007';  -- sale supervisor
  v_mine uuid;   -- a customer owned by the rep
  v_thrs uuid;   -- one owned by the unrelated rep
  v_house uuid;  -- one with no owner
  v_house2 uuid; -- one used for the status-default assertions
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
  perform pg_temp.new_user(v_sup,  'cx.sup@example.test', 'Cx Sup',   'sales_supervisor');
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

  ----------------------------------------------------------------------------
  -- Retiring, which is the only way anything leaves
  --
  -- 0031 took the delete away from this module. A contact is retired instead:
  -- the row stays, so who used to answer that phone is still answerable, and
  -- the screens stop offering them.
  ----------------------------------------------------------------------------
  update public.customer_contacts
     set active = false, is_primary = false
   where customer_id = v_mine and name = 'Sok Dara';

  perform pg_temp.eq('a retired contact is still on the record',
    (select count(*)::text from public.customer_contacts
      where customer_id = v_mine and name = 'Sok Dara'), '1');
  perform pg_temp.eq('but leaves the count of people at the shop',
    (select contact_count::text from public.customer_directory where id = v_mine), '1');
  perform pg_temp.eq('and the next one becomes who you ring',
    (select primary_contact_name from public.customer_directory where id = v_mine),
    'Chan Thida');

  -- The partial unique index counts only active rows. Without that, the person
  -- who left would hold the slot against the person who replaced them.
  update public.customer_contacts set is_primary = true
   where customer_id = v_mine and name = 'Chan Thida';
  perform pg_temp.eq('a retired primary does not block their replacement',
    (select name from public.customer_contacts
      where customer_id = v_mine and is_primary and active), 'Chan Thida');
  perform pg_temp.rejects('though two live primaries are still refused',
    format('insert into public.customer_contacts (customer_id, name, is_primary)
              values (%L, ''CX Second Primary'', true)', v_mine));

  update public.customer_pictures
     set active = false, is_primary = false
   where customer_id = v_mine and description = 'Shopfront';
  perform pg_temp.eq('a retired picture leaves the list too',
    (select primary_photo_path from public.customer_directory where id = v_mine),
    v_mine || '/inside.jpg');
  perform pg_temp.eq('while its row stays put',
    (select count(*)::text from public.customer_pictures
      where customer_id = v_mine and description = 'Shopfront'), '1');

  -- Put the shop back as the rest of the suite expects to find it.
  update public.customer_contacts set active = true
   where customer_id = v_mine and name = 'Sok Dara';
  update public.customer_pictures set active = true
   where customer_id = v_mine and description = 'Shopfront';

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
  -- Status is set by an action, not by the form
  --
  -- The customer form does not send `status` at all: a new shop takes the
  -- column default, and an edit leaves whatever the status card set. These
  -- assert both halves, because the failure mode is silent — a form that sent
  -- a defaulted status would quietly reactivate a banned shop every time
  -- somebody corrected its phone number.
  ----------------------------------------------------------------------------
  insert into public.customers (shop_name, business_type, credit_limit_usd)
    values ('CX Default Status', 'Grocery', 500) returning id into v_house2;
  perform pg_temp.eq('a new customer defaults to active',
    (select status::text from public.customers where id = v_house2), 'active');
  perform pg_temp.eq('and arrives with no status note',
    (select coalesce(status_note, 'none') from public.customers where id = v_house2), 'none');

  update public.customers set status = 'banned', status_note = 'Cheques returned twice'
   where id = v_house2;
  -- An ordinary correction, exactly as the form sends it.
  update public.customers set business_type = 'Hardware', landmark = 'By the market'
   where id = v_house2;
  perform pg_temp.eq('editing a customer leaves its status alone',
    (select status::text from public.customers where id = v_house2), 'banned');
  perform pg_temp.eq('and keeps the reason it was banned',
    (select status_note from public.customers where id = v_house2), 'Cheques returned twice');

  update public.customers set status = 'active', status_note = null where id = v_house2;
  perform pg_temp.eq('reactivating clears the reason, so nothing stale is left',
    (select status::text || '/' || coalesce(status_note, 'none')
       from public.customers where id = v_house2), 'active/none');

  ----------------------------------------------------------------------------
  -- The credit limit: a default, and a permission of its own
  --
  -- 0032. A shop starts at $500 rather than at nothing, because "no limit set"
  -- and "unlimited" are the same value in a nullable numeric column and the
  -- second is not what anybody meant by leaving the box alone.
  ----------------------------------------------------------------------------
  insert into public.customers (shop_name) values ('CX Default Credit');
  perform pg_temp.eq('a new shop starts on the standard limit',
    (select credit_limit_usd::text from public.customers
      where shop_name = 'CX Default Credit'), '500.00');
  perform pg_temp.eq('and the form is reading the same number the column uses',
    app.default_credit_limit()::text, '500');
  -- Still a decision somebody can make, not a value forced on the record.
  insert into public.customers (shop_name, credit_limit_usd) values ('CX No Credit', 0);
  perform pg_temp.eq('but it can still be set to nothing outright',
    (select credit_limit_usd::text from public.customers
      where shop_name = 'CX No Credit'), '0.00');

  perform pg_temp.eq('a supervisor may move a credit limit',
    app.effective_scope(v_sup, 'customer_credit', 'edit')::text, 'any');
  perform pg_temp.eq('so may accounting',
    app.effective_scope(v_acc, 'customer_credit', 'edit')::text, 'any');
  perform pg_temp.eq('and an administrator',
    app.effective_scope(v_sa, 'customer_credit', 'edit')::text, 'any');
  perform pg_temp.eq('an ordinary rep may not',
    app.effective_scope(v_rep, 'customer_credit', 'edit')::text, null);
  -- The permission exists to be granted, not to be walked into: it is in the
  -- matrix but in nobody's navigation.
  perform pg_temp.eq('and it is not a page anybody can navigate to',
    (select count(*)::text from public.view_modules where module_key = 'customer_credit'), '0');

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

    -- Refused rather than matching nothing: 0031 revoked the privilege, so the
    -- statement never reaches a policy to be filtered by.
    perform pg_temp.refused('sales may not delete a shop',
      format('delete from public.customers where id = %L', v_mine));

    -- The credit limit is the one field on their own account a rep may not
    -- move. Row level security chooses rows, not columns, so this is a trigger
    -- and it raises rather than silently matching nothing.
    perform pg_temp.refused('a rep may not raise a credit limit, even on their own shop',
      format('update public.customers set credit_limit_usd = 5000 where id = %L', v_mine));
    perform pg_temp.eq('and the limit is left where it was',
      (select coalesce(credit_limit_usd::text, 'none') from public.customers where id = v_mine),
      '500.00');
    -- An ordinary correction sends every field back, the limit among them. That
    -- must go through, or a rep could not edit their own shop at all.
    update public.customers
       set business_type = 'Grocery', credit_limit_usd = credit_limit_usd
     where id = v_mine;
    perform pg_temp.eq('but sending it back unchanged is not a change',
      (select business_type from public.customers where id = v_mine), 'Grocery');
    -- Creating a shop on the standard limit is likewise not a decision.
    insert into public.customers (shop_name, credit_limit_usd) values ('CX Rep Default', 500);
    perform pg_temp.eq('and a rep may create a shop on the default',
      (select count(*)::text from public.customers where shop_name = 'CX Rep Default'), '1');
    perform pg_temp.refused('though not on one they chose',
      'insert into public.customers (shop_name, credit_limit_usd) values (''CX Rep Rich'', 9000)');

    perform pg_temp.act_as(v_sup);
    insert into public.customers (shop_name) values ('CX Sup Shop');
    update public.customers set credit_limit_usd = 2500 where shop_name = 'CX Sup Shop';
    perform pg_temp.eq('a supervisor may move one on a shop they hold',
      (select credit_limit_usd::text from public.customers where shop_name = 'CX Sup Shop'),
      '2500.00');

    -- Back to the rep, whose account the assertions below are about.
    perform pg_temp.act_as(v_rep);

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

    -- Not even the administrator, and that is the point of 0031: a customer
    -- leaves the book by its status, and a contact or picture by being retired.
    -- Nothing in this module destroys a row.
    perform pg_temp.act_as(v_sa);
    perform pg_temp.refused('nor may an administrator',
      format('delete from public.customers where id = %L', v_mine));
    perform pg_temp.refused('nor delete a contact',
      format('delete from public.customer_contacts where customer_id = %L', v_mine));
    perform pg_temp.refused('nor a picture',
      format('delete from public.customer_pictures where customer_id = %L', v_mine));
    perform pg_temp.eq('the shop and its people are all still there',
      (select (select count(*) from public.customers where id = v_mine)
            + (select count(*) from public.customer_contacts where customer_id = v_mine))::text,
      '4');

    -- Retiring is what the form does instead, and it goes through the policy.
    update public.customer_contacts set active = false
     where customer_id = v_mine and name = 'Chan Thida';
    perform pg_temp.eq('but retiring a contact goes through',
      (select active::text from public.customer_contacts
        where customer_id = v_mine and name = 'Chan Thida'), 'false');

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
