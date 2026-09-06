-- settings.test.sql
--
-- The organisation's own settings, of which there is exactly one row.
--
-- Two questions here. Is it really one row — because a second row of settings
-- is a second answer to every question in it, and nothing in the app would say
-- which one won. And can only the settings module change it, given that every
-- screen showing a price reads it and therefore everyone can.
--
-- Everything happens inside one transaction that is deliberately rolled back,
-- so a run leaves no trace.
--
--     psql "$DATABASE_URL" -f supabase/tests/settings.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  SETTINGS OK - 9 assertions passed
--
-- Anything else is a real failure and names the assertion that broke.

-- The item side of 0035 — packing, stock, the widened select policies — is
-- covered in inventory.test.sql, where the items and the people who may not
-- touch them already are. What is here is the part that has no equivalent
-- anywhere else in the schema: a table where the row belongs to a person
-- rather than to a module, so the question is never "may you" but "is it
-- yours".
--
-- Everything happens inside one transaction that is deliberately rolled back,
-- so a run leaves no trace.
--
--     psql "$DATABASE_URL" -f supabase/tests/catalog.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  CATALOG OK - 37 assertions passed (rls: ran)
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
  v_sa  uuid := '00000000-0000-4000-8000-00000010a001';  -- super admin
  v_rep uuid := '00000000-0000-4000-8000-00000010a002';  -- a sales rep
  v_n   integer := 0;
begin
  perform pg_temp.new_user(v_sa,  'cur.sa@example.test',  'Cur Admin', 'system_admin');
  perform pg_temp.new_user(v_rep, 'cur.rep@example.test', 'Cur Rep',   'sales');
  update public.users set is_super_admin = true where id = v_sa;

  ----------------------------------------------------------------------------
  -- One row
  ----------------------------------------------------------------------------
  if (select count(*) from public.app_settings) <> 1 then
    raise exception 'FAILED: settings is not a single row';
  end if;
  v_n := v_n + 1;

  begin
    insert into public.app_settings (id) values (false);
    raise exception 'FAILED: a second settings row was accepted';
  exception when check_violation or unique_violation then null;
  end;
  v_n := v_n + 1;

  -- Dollars until somebody says otherwise, which is what every screen falls
  -- back to when the row cannot be read at all.
  if (select primary_currency from public.app_settings) <> 'usd' then
    raise exception 'FAILED: default is not dollars';
  end if;
  v_n := v_n + 1;

  ----------------------------------------------------------------------------
  -- Who may read it, and who may change it
  ----------------------------------------------------------------------------
  set local role authenticated;

  -- Everybody reads it: a screen that shows a price needs to know which one.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_rep::text, 'role', 'authenticated')::text, true);
  if (select count(*) from public.app_settings) <> 1 then
    raise exception 'FAILED: a rep cannot read the setting';
  end if;
  v_n := v_n + 1;

  -- A refused update matches no rows and raises nothing at all, so the value
  -- afterwards is the only thing that proves it was refused.
  update public.app_settings set primary_currency = 'khr' where id;
  if (select primary_currency from public.app_settings) <> 'usd' then
    raise exception 'FAILED: a rep changed the currency';
  end if;
  v_n := v_n + 1;

  -- Refused by the grant rather than by a policy, so these two raise instead
  -- of quietly matching nothing. There is no delete or insert policy on
  -- purpose: the row exists, and there is never a second one.
  begin
    delete from public.app_settings;
    raise exception 'FAILED: a rep deleted the settings row';
  exception when insufficient_privilege then null;
  end;
  v_n := v_n + 1;

  begin
    insert into public.app_settings (id) values (true);
    raise exception 'FAILED: a rep inserted a settings row';
  exception when insufficient_privilege or unique_violation then null;
  end;
  v_n := v_n + 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_sa::text, 'role', 'authenticated')::text, true);
  update public.app_settings set primary_currency = 'khr' where id;
  if (select primary_currency from public.app_settings) <> 'khr' then
    raise exception 'FAILED: an administrator could not change the currency';
  end if;
  v_n := v_n + 1;

  -- Two currencies, and nothing else is one. HIG prices in these two.
  begin
    update public.app_settings set primary_currency = 'eur' where id;
    raise exception 'FAILED: a third currency was accepted';
  exception when invalid_text_representation then null;
  end;
  v_n := v_n + 1;

  reset role;
  raise exception 'SETTINGS OK - % assertions passed', v_n;
end;
$$;
