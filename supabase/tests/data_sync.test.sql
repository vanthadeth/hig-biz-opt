-- data_sync.test.sql
--
-- The sync's own suite. Most of it is about one question: what stops a person
-- who may define a sync from defining one into public.users that maps a sheet
-- column onto is_super_admin.
--
-- The answer is in three places and all three are asserted here — the target
-- must be in a seeded registry, every mapped column must survive an allow-list
-- checked by a trigger, and the only function that writes re-checks both before
-- it composes a statement. A table outside the registry offers no columns at
-- all, so there is nothing a mapping could even name.
--
-- The rest is the failure that would cost real money: a sync that cannot tell
-- an edited row from a new one doubles the catalogue every night.
--
--     psql "$DATABASE_URL" -f supabase/tests/data_sync.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  DATA SYNC OK - 52 assertions passed (rls: ran)
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
      or unique_violation or raise_exception or no_data_found then
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
  v_sa   uuid := '00000000-0000-4000-8000-0000000d0001';  -- super admin
  v_rep  uuid := '00000000-0000-4000-8000-0000000d0002';  -- sales, no data_sync
  v_sync uuid;
  v_cat_sync uuid;
  v_ref_sync uuid;
  v_n    integer;
  v_rls  text := 'skipped (cannot assume the authenticated role)';
begin
  perform set_config('higtest.checks', '0', false);

  perform pg_temp.new_user(v_sa,  'dx.sa@example.test',  'Sync Admin', 'system_admin');
  perform pg_temp.new_user(v_rep, 'dx.rep@example.test', 'Sync Rep',   'sales');
  update public.users set is_super_admin = true where id = v_sa;

  ----------------------------------------------------------------------------
  -- The registry
  ----------------------------------------------------------------------------
  -- Eleven, and adding a twelfth is a migration, which is a review. That is
  -- the whole reason the target list is a table rather than a text box.
  perform pg_temp.eq('the seeded targets are all there',
    (select count(*)::text from public.sync_targets), '11');
  perform pg_temp.eq('and none of them is a table nobody should sync into',
    (select count(*)::text from public.sync_targets
      where table_name in ('users', 'roles', 'role_permissions', 'audit_log',
                           'user_permission_overrides', 'sync_definitions')), '0');
  perform pg_temp.eq('items are matched on their code',
    (select key_column from public.sync_targets where table_name = 'items'), 'code');
  -- The index is on an expression, and inferring the wrong one silently turns
  -- every update into an insert.
  perform pg_temp.eq('and the conflict target names the expression index',
    (select conflict_target from public.sync_targets where table_name = 'items'),
    '(lower(code)) where code is not null');

  ----------------------------------------------------------------------------
  -- What a sync may write to
  --
  -- The allow-list is the thing standing between "a sync names a table" and
  -- "a sync names public.users and maps a column onto is_super_admin".
  ----------------------------------------------------------------------------
  perform pg_temp.ok('a real column is offered',
    exists (select 1 from app.sync_columns('items') where column_name = 'name_en'));
  perform pg_temp.ok('identity is not',
    not exists (select 1 from app.sync_columns('items') where column_name = 'id'));
  perform pg_temp.ok('nor are the timestamps',
    not exists (select 1 from app.sync_columns('items')
                 where column_name in ('created_at', 'updated_at')));
  perform pg_temp.ok('nor is who a customer belongs to',
    not exists (select 1 from app.sync_columns('customers') where column_name = 'owner_id'));
  -- A table outside the registry offers nothing at all, so there is no column
  -- on public.users a mapping could even name.
  perform pg_temp.eq('a table that is not a target offers nothing',
    (select count(*)::text from app.sync_columns('users')), '0');
  perform pg_temp.eq('and neither does one that does not exist',
    (select count(*)::text from app.sync_columns('nonesuch')), '0');

  ----------------------------------------------------------------------------
  -- A sync
  ----------------------------------------------------------------------------
  -- Natural-key matching, which is what a sheet with no ID column uses. The
  -- sheet_id path gets its own section below.
  insert into public.sync_definitions
    (name, spreadsheet_id, tab_name, target_table, trigger_kind, interval_minutes, match_on)
    values ('DX Items', 'sheet-abc', 'Items', 'items', 'interval', 60, 'natural')
    returning id into v_sync;

  perform pg_temp.ok('a sync gets a hook token of its own',
    (select length(hook_token) >= 32 from public.sync_definitions where id = v_sync));
  perform pg_temp.ok('and starts switched on',
    (select active from public.sync_definitions where id = v_sync));

  perform pg_temp.rejects('an interval sync needs an interval',
    'insert into public.sync_definitions (name, spreadsheet_id, tab_name, target_table,
       trigger_kind, interval_minutes)
     values (''DX Broken'', ''s'', ''t'', ''items'', ''interval'', null)');
  perform pg_temp.rejects('a sync may not name a table outside the registry',
    'insert into public.sync_definitions (name, spreadsheet_id, tab_name, target_table,
       trigger_kind)
     values (''DX Escalate'', ''s'', ''t'', ''users'', ''change'')');

  ----------------------------------------------------------------------------
  -- The mapping, and the guard on it
  ----------------------------------------------------------------------------
  insert into public.sync_column_maps (sync_id, sheet_column, target_column, value_kind, sort_order)
    values (v_sync, 'Code', 'code', 'text', 1),
           (v_sync, 'Name', 'name_en', 'text', 2),
           (v_sync, 'Price', 'price_usd', 'number', 3),
           (v_sync, 'Notes', null, 'text', 4);

  -- Storing the skips as well as the picks is what lets the screen show a
  -- sheet's columns without re-reading it, and makes a newly-appeared column
  -- visibly unmapped rather than silently so.
  perform pg_temp.eq('a skipped column is still recorded',
    (select count(*)::text from public.sync_column_maps
      where sync_id = v_sync and target_column is null), '1');

  perform pg_temp.rejects('a mapping may not point at a column the registry blocks',
    format('insert into public.sync_column_maps (sync_id, sheet_column, target_column)
              values (%L, ''Sneaky'', ''id'')', v_sync));
  perform pg_temp.rejects('nor at a column that does not exist',
    format('insert into public.sync_column_maps (sync_id, sheet_column, target_column)
              values (%L, ''Sneaky'', ''no_such_column'')', v_sync));
  perform pg_temp.rejects('two sheet columns may not feed one table column',
    format('insert into public.sync_column_maps (sync_id, sheet_column, target_column)
              values (%L, ''Name Again'', ''name_en'')', v_sync));
  perform pg_temp.rejects('nor may one sheet column appear twice',
    format('insert into public.sync_column_maps (sync_id, sheet_column, target_column)
              values (%L, ''Code'', ''name_km'')', v_sync));
  insert into public.sync_column_maps (sync_id, sheet_column, target_column)
    values (v_sync, 'Notes 2', null);
  perform pg_temp.eq('but a sheet may have many columns nobody wants',
    (select count(*)::text from public.sync_column_maps
      where sync_id = v_sync and target_column is null), '2');

  ----------------------------------------------------------------------------
  -- The write
  ----------------------------------------------------------------------------
  v_n := app.sync_apply(v_sync, '[
    {"code": "DX-001", "name_en": "Sync Water", "price_usd": 0.5},
    {"code": "DX-002", "name_en": "Sync Rice",  "price_usd": 12}
  ]'::jsonb);

  perform pg_temp.eq('two new rows are written', v_n::text, '2');
  perform pg_temp.eq('and they are there',
    (select count(*)::text from public.items where code like 'DX-%'), '2');
  perform pg_temp.eq('with their values read as the column type',
    (select price_usd::text from public.items where code = 'DX-001'), '0.50');

  -- The second run is the one that matters: a sync that cannot tell an edited
  -- row from a new one doubles the table every night.
  v_n := app.sync_apply(v_sync, '[
    {"code": "DX-001", "name_en": "Sync Water (1.5L)", "price_usd": 0.75}
  ]'::jsonb);

  perform pg_temp.eq('a row already there is updated, not added', v_n::text, '1');
  perform pg_temp.eq('still two rows',
    (select count(*)::text from public.items where code like 'DX-%'), '2');
  perform pg_temp.eq('and the row was changed',
    (select name_en from public.items where code = 'DX-001'), 'Sync Water (1.5L)');
  perform pg_temp.eq('including the price',
    (select price_usd::text from public.items where code = 'DX-001'), '0.75');

  -- The index is on lower(code), so a sheet that changed the case of a code
  -- must still match the row rather than make a second one.
  v_n := app.sync_apply(v_sync, '[{"code": "dx-001", "name_en": "Lower"}]'::jsonb);
  perform pg_temp.eq('a code in another case is the same code',
    (select count(*)::text from public.items where lower(code) = 'dx-001'), '1');

  -- Columns the mapping does not name are left alone rather than nulled: a
  -- sheet is not the whole truth about an item.
  update public.items set name_km = 'ទឹក' where code = 'DX-002';
  perform app.sync_apply(v_sync, '[{"code": "DX-002", "name_en": "Sync Rice"}]'::jsonb);
  perform pg_temp.eq('an unmapped column is not wiped by a sync',
    (select name_km from public.items where code = 'DX-002'), 'ទឹក');

  update public.sync_definitions set active = false where id = v_sync;
  perform pg_temp.rejects('a sync that is switched off does not write',
    format('select app.sync_apply(%L, ''[{"code":"DX-003","name_en":"Nope"}]''::jsonb)', v_sync));

  ----------------------------------------------------------------------------
  -- Privileges
  ----------------------------------------------------------------------------
  perform pg_temp.eq('nobody signed in may call the writer directly',
    (select count(*)::text from information_schema.role_routine_grants
      where routine_schema = 'app' and routine_name = 'sync_apply'
        and grantee in ('authenticated', 'anon', 'PUBLIC')), '0');
  perform pg_temp.eq('and anon may not read a sync',
    (select count(*)::text from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'sync_definitions'
        and grantee = 'anon'), '0');
  -- A run is history. The only thing that writes one is the server process.
  perform pg_temp.ok('a run is history, not something to edit',
    (select count(*) from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'sync_runs'
        and grantee = 'authenticated'
        and lower(privilege_type) in ('insert', 'update', 'delete')) = 0);

  ----------------------------------------------------------------------------
  -- Row level security
  ----------------------------------------------------------------------------
  update public.sync_definitions set active = true where id = v_sync;

  begin
    execute 'set local role authenticated';

    perform pg_temp.act_as(v_rep);
    perform pg_temp.eq('a sales rep sees no syncs at all',
      (select count(*)::text from public.sync_definitions), '0');
    perform pg_temp.eq('nor any mappings',
      (select count(*)::text from public.sync_column_maps), '0');
    perform pg_temp.eq('nor the run log',
      (select count(*)::text from public.sync_runs), '0');
    perform pg_temp.eq('nor what tables a sync could write to',
      (select count(*)::text from public.sync_targets), '0');
    perform pg_temp.refused('and may not define one',
      'insert into public.sync_definitions (name, spreadsheet_id, tab_name, target_table,
         trigger_kind) values (''DX Sneaked'', ''s'', ''t'', ''items'', ''change'')');
    perform pg_temp.eq('nor read a column list to map against',
      (select count(*)::text from public.sync_columns('items')), '0');

    perform pg_temp.act_as(v_sa);
    perform pg_temp.ok('an administrator sees them',
      (select count(*) from public.sync_definitions) >= 1);
    perform pg_temp.ok('and can read the columns to map against',
      (select count(*) from public.sync_columns('items')) > 0);

    execute 'reset role';
    v_rls := 'ran';
  exception when insufficient_privilege then
    execute 'reset role';
    v_rls := 'skipped (cannot assume the authenticated role)';
  end;

  ----------------------------------------------------------------------------
  -- The customer key this migration added
  --
  -- Without one the second run cannot tell an edited shop from a new one, and
  -- the customer book fills with duplicates.
  ----------------------------------------------------------------------------
  insert into public.customers (shop_name, code) values ('DX Shop', 'DXC-1');
  perform pg_temp.rejects('a customer code may not be reused',
    'insert into public.customers (shop_name, code) values (''DX Other'', ''dxc-1'')');
  insert into public.customers (shop_name) values ('DX No Code One');
  insert into public.customers (shop_name) values ('DX No Code Two');
  perform pg_temp.eq('but customers without one do not collide',
    (select count(*)::text from public.customers
      where code is null and shop_name like 'DX No Code%'), '2');

  ----------------------------------------------------------------------------
  -- Sheet IDs, and the links between sheets
  --
  -- The sheets reference each other by an ID column, and until everything has
  -- moved across those IDs are the only thing saying which item belongs to
  -- which category. A mapping may declare a column to be one, and the writer
  -- resolves it to our own key.
  ----------------------------------------------------------------------------
  insert into public.sync_definitions
    (name, spreadsheet_id, tab_name, target_table, trigger_kind, interval_minutes)
    values ('DX Categories', 's', 'Cat', 'item_categories', 'interval', 60)
    returning id into v_cat_sync;
  perform pg_temp.eq('a new sync matches on the sheet''s own ID',
    (select match_on::text from public.sync_definitions where id = v_cat_sync), 'sheet_id');

  insert into public.sync_column_maps (sync_id, sheet_column, target_column, sort_order)
    values (v_cat_sync, 'ID', 'sheet_id', 1),
           (v_cat_sync, 'Name', 'name_en', 2);

  insert into public.sync_definitions
    (name, spreadsheet_id, tab_name, target_table, trigger_kind, interval_minutes)
    values ('DX Ref Items', 's', 'Itm', 'items', 'interval', 60)
    returning id into v_ref_sync;
  insert into public.sync_column_maps
    (sync_id, sheet_column, target_column, reference_table, sort_order)
    values (v_ref_sync, 'ID', 'sheet_id', null, 1),
           (v_ref_sync, 'Name', 'name_en', null, 2),
           (v_ref_sync, 'Category', 'category_id', 'item_categories', 3);

  -- The child first, deliberately. The parent has not been synced, and a
  -- reference that finds nothing must write null rather than fail: getting the
  -- order right the first time is not something anybody should have to do.
  v_n := app.sync_apply(v_ref_sync,
    '[{"sheet_id":"I-1","name_en":"DX Ref Water","category_id":"C-9"}]'::jsonb);
  perform pg_temp.eq('a reference to a row that is not there yet writes null',
    (select coalesce(category_id::text, 'null') from public.items where sheet_id = 'I-1'),
    'null');
  perform pg_temp.eq('and the row itself is still written',
    (select name_en from public.items where sheet_id = 'I-1'), 'DX Ref Water');

  perform app.sync_apply(v_cat_sync, '[{"sheet_id":"C-9","name_en":"DX Ref Drinks"}]'::jsonb);
  perform app.sync_apply(v_ref_sync,
    '[{"sheet_id":"I-1","name_en":"DX Ref Water","category_id":"C-9"}]'::jsonb);

  perform pg_temp.eq('running it again once the parent is there links them up',
    (select i.category_id::text from public.items i where i.sheet_id = 'I-1'),
    (select c.id::text from public.item_categories c where c.sheet_id = 'C-9'));
  -- And the second run updated rather than adding: matching on sheet_id is what
  -- stops a nightly sync doubling the catalogue.
  perform pg_temp.eq('and does not make a second row',
    (select count(*)::text from public.items where sheet_id = 'I-1'), '1');

  -- A geo table is keyed by its official code, so a reference into one has to
  -- store that rather than a uuid it does not have.
  perform pg_temp.eq('a code-keyed target resolves to its code',
    (select pk_column from public.sync_targets where table_name = 'geo_provinces'), 'code');

  perform pg_temp.ok('sheet_id is offered as something to map onto',
    exists (select 1 from app.sync_columns('items') where column_name = 'sheet_id'));

  -- Two rows may not claim the same sheet ID: it is an identifier or it is
  -- nothing.
  perform pg_temp.rejects('two rows may not share a sheet ID',
    'insert into public.item_categories (name_en, sheet_id) values (''DX Clash'', ''C-9'')');
  -- But the rows this app created itself have none, and must not collide.
  insert into public.item_categories (name_en) values ('DX No Sheet One');
  insert into public.item_categories (name_en) values ('DX No Sheet Two');
  perform pg_temp.eq('rows the app made itself do not collide on an absent one',
    (select count(*)::text from public.item_categories
      where sheet_id is null and name_en like 'DX No Sheet%'), '2');

  raise exception 'DATA SYNC OK - % assertions passed (rls: %)',
    current_setting('higtest.checks'), v_rls;
end;
$$;
