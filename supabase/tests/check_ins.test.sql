-- check_ins.test.sql
--
-- The attendance module's suite, alongside access_model.test.sql,
-- inventory.test.sql, customers.test.sql and audit_log.test.sql.
--
-- Two things make it worth its own file. The table is append-only, and "nobody
-- can update this, including the super admin" is a claim about grants rather
-- than about policies, so it is asserted differently from everything else here.
-- And 0035 reopened public.guard_self_edit to add a column, which is the kind
-- of edit that silently stops guarding if the tuple is got wrong — so the guard
-- is re-tested here rather than only in the access-model suite.
--
-- Everything happens inside one transaction that is deliberately rolled back,
-- so a run leaves no trace.
--
--     psql "$DATABASE_URL" -f supabase/tests/check_ins.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  CHECK-INS OK - 56 assertions passed (rls: ran)
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
      or unique_violation or raise_exception
      -- Wider than the other suites' copy by one: `kind` is an enum, and a
      -- value outside it is refused as bad input rather than as a constraint.
      or invalid_text_representation then
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

-- Back to nobody, which is what a migration, a script or the mini app's own
-- route handler looks like from inside a trigger.
create or replace function pg_temp.act_as_nobody()
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', '', true);
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

-- One punch, with everything the table insists on.
create or replace function pg_temp.punch(
  p_user uuid, p_kind text, p_when timestamptz
) returns uuid language plpgsql as $f$
declare v_id uuid;
begin
  insert into public.check_ins
    (user_id, kind, occurred_at, latitude, longitude, accuracy_m, location_source, photo_path)
  values
    (p_user, p_kind::public.check_in_kind, p_when, 11.556400, 104.928200, 12.0,
     'telegram', p_user::text || '/1.jpg')
  returning id into v_id;
  return v_id;
end;
$f$;

do $$
declare
  v_sa    uuid := '00000000-0000-4000-8000-0000000e0001';  -- super admin
  v_sup   uuid := '00000000-0000-4000-8000-0000000e0002';  -- sale supervisor, manages the rep
  v_rep   uuid := '00000000-0000-4000-8000-0000000e0003';  -- sales, reports to the supervisor
  v_other uuid := '00000000-0000-4000-8000-0000000e0004';  -- sales, unrelated
  v_hr    uuid := '00000000-0000-4000-8000-0000000e0005';  -- HR, view 'any'
  v_gone  uuid := '00000000-0000-4000-8000-0000000e0006';  -- sales, suspended
  v_rls text := 'skipped (cannot assume the authenticated role)';
begin
  perform set_config('higtest.checks', '0', false);

  perform pg_temp.new_user(v_sa,    'ci.sa@example.test',  'Ci Admin', 'system_admin');
  perform pg_temp.new_user(v_sup,   'ci.sup@example.test', 'Ci Sup',   'sales_supervisor');
  perform pg_temp.new_user(v_rep,   'ci.rep@example.test', 'Ci Rep',   'sales');
  perform pg_temp.new_user(v_other, 'ci.oth@example.test', 'Ci Other', 'sales');
  perform pg_temp.new_user(v_hr,    'ci.hr@example.test',  'Ci Hr',    'hr');
  perform pg_temp.new_user(v_gone,  'ci.gone@example.test','Ci Gone',  'sales');
  update public.users set is_super_admin = true where id = v_sa;
  update public.users set manager_id = v_sup where id = v_rep;

  ----------------------------------------------------------------------------
  -- The registry
  ----------------------------------------------------------------------------
  perform pg_temp.eq('the module is registered',
    (select name from public.modules where key = 'check_in'), 'Check-in');
  perform pg_temp.eq('and it is in no view''s navigation set',
    (select count(*)::text from public.view_modules where module_key = 'check_in'), '0');
  perform pg_temp.ok('its icon is one the client actually has',
    (select icon = 'pin' from public.modules where key = 'check_in'));

  ----------------------------------------------------------------------------
  -- The default matrix
  ----------------------------------------------------------------------------
  perform pg_temp.eq('every role may punch for itself',
    (select count(*)::text from public.role_permissions
      where module_key = 'check_in' and action = 'add' and scope = 'own'),
    (select count(*)::text from public.roles));
  perform pg_temp.eq('nobody is given add beyond their own',
    (select count(*)::text from public.role_permissions
      where module_key = 'check_in' and action = 'add' and scope <> 'own'), '0');
  perform pg_temp.eq('a supervisor reviews the people under them',
    (select scope::text from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
     where r.key = 'sales_supervisor' and rp.module_key = 'check_in' and rp.action = 'view'), 'sub');
  perform pg_temp.eq('a sale manager likewise',
    (select scope::text from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
     where r.key = 'sales_manager' and rp.module_key = 'check_in' and rp.action = 'view'), 'sub');
  perform pg_temp.eq('HR sees everyone',
    (select scope::text from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
     where r.key = 'hr' and rp.module_key = 'check_in' and rp.action = 'view'), 'any');
  perform pg_temp.eq('a rep sees only their own',
    (select scope::text from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
     where r.key = 'sales' and rp.module_key = 'check_in' and rp.action = 'view'), 'own');

  ----------------------------------------------------------------------------
  -- What the column definitions insist on
  ----------------------------------------------------------------------------
  perform pg_temp.rejects('a latitude beyond the pole is refused',
    'insert into public.check_ins (user_id, kind, latitude, longitude, location_source, photo_path)
       values (''' || v_rep || ''', ''in'', 91, 104.9282, ''telegram'', ''p.jpg'')');
  perform pg_temp.rejects('a longitude past the date line is refused',
    'insert into public.check_ins (user_id, kind, latitude, longitude, location_source, photo_path)
       values (''' || v_rep || ''', ''in'', 11.5564, 181, ''telegram'', ''p.jpg'')');
  perform pg_temp.rejects('a punch with no location is refused',
    'insert into public.check_ins (user_id, kind, location_source, photo_path)
       values (''' || v_rep || ''', ''in'', ''telegram'', ''p.jpg'')');
  perform pg_temp.rejects('a punch with no photograph is refused',
    'insert into public.check_ins (user_id, kind, latitude, longitude, location_source)
       values (''' || v_rep || ''', ''in'', 11.5564, 104.9282, ''telegram'')');
  perform pg_temp.rejects('a blank photograph path is refused too',
    'insert into public.check_ins (user_id, kind, latitude, longitude, location_source, photo_path)
       values (''' || v_rep || ''', ''in'', 11.5564, 104.9282, ''telegram'', ''   '')');
  perform pg_temp.rejects('a negative accuracy is refused',
    'insert into public.check_ins (user_id, kind, latitude, longitude, accuracy_m, location_source, photo_path)
       values (''' || v_rep || ''', ''in'', 11.5564, 104.9282, -1, ''telegram'', ''p.jpg'')');
  perform pg_temp.rejects('an unnamed instrument is refused',
    'insert into public.check_ins (user_id, kind, latitude, longitude, location_source, photo_path)
       values (''' || v_rep || ''', ''in'', 11.5564, 104.9282, ''guesswork'', ''p.jpg'')');
  perform pg_temp.rejects('a punch that is neither in nor out is refused',
    'insert into public.check_ins (user_id, kind, latitude, longitude, location_source, photo_path)
       values (''' || v_rep || ''', ''lunch'', 11.5564, 104.9282, ''telegram'', ''p.jpg'')');
  perform pg_temp.rejects('and a punch belonging to nobody is refused',
    'insert into public.check_ins (user_id, kind, latitude, longitude, location_source, photo_path)
       values (null, ''in'', 11.5564, 104.9282, ''telegram'', ''p.jpg'')');

  ----------------------------------------------------------------------------
  -- Whose punch it is
  ----------------------------------------------------------------------------
  perform pg_temp.act_as(v_rep);
  insert into public.check_ins (kind, latitude, longitude, location_source, photo_path)
    values ('in', 11.5564, 104.9282, 'telegram', 'defaulted.jpg');
  perform pg_temp.eq('user_id defaults to whoever is punching',
    (select user_id::text from public.check_ins where photo_path = 'defaulted.jpg'),
    v_rep::text);
  perform pg_temp.ok('an accuracy the instrument did not report is allowed',
    (select accuracy_m is null from public.check_ins where photo_path = 'defaulted.jpg'));

  -- The clock is the server's. A phone's is a setting, and an attendance record
  -- whose time the employee chose is not evidence of anything.
  insert into public.check_ins
    (kind, occurred_at, latitude, longitude, location_source, photo_path)
  values ('in', timestamptz '2001-01-01 08:00+07', 11.5564, 104.9282, 'telegram', 'backdated.jpg');
  perform pg_temp.ok('a backdated punch is stamped with the time it arrived',
    (select occurred_at > now() - interval '1 minute'
       from public.check_ins where photo_path = 'backdated.jpg'));
  perform pg_temp.act_as_nobody();

  -- ...but a migration or a backfill, which is nobody, keeps what it sent.
  insert into public.check_ins
    (user_id, kind, occurred_at, latitude, longitude, location_source, photo_path)
  values (v_rep, 'in', timestamptz '2001-01-01 08:00+07', 11.5564, 104.9282, 'browser', 'backfill.jpg');
  perform pg_temp.eq('while a backfill keeps the time it states',
    (select to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD')
       from public.check_ins where photo_path = 'backfill.jpg'), '2001-01-01');

  ----------------------------------------------------------------------------
  -- Append-only, by grant rather than by policy
  ----------------------------------------------------------------------------
  perform pg_temp.ok('authenticated may read check-ins',
    has_table_privilege('authenticated', 'public.check_ins', 'select'));
  perform pg_temp.ok('and may write one',
    has_table_privilege('authenticated', 'public.check_ins', 'insert'));
  perform pg_temp.ok('but holds no update privilege at all',
    not has_table_privilege('authenticated', 'public.check_ins', 'update'));
  perform pg_temp.ok('and no delete privilege at all',
    not has_table_privilege('authenticated', 'public.check_ins', 'delete'));
  perform pg_temp.eq('so there is no update policy to argue with',
    (select count(*)::text from pg_policies
      where schemaname = 'public' and tablename = 'check_ins' and cmd = 'UPDATE'), '0');
  perform pg_temp.eq('and no delete policy either',
    (select count(*)::text from pg_policies
      where schemaname = 'public' and tablename = 'check_ins' and cmd = 'DELETE'), '0');
  perform pg_temp.ok('the stamping trigger is not callable as an RPC',
    not has_function_privilege('authenticated', 'public.stamp_check_in()', 'execute'));
  perform pg_temp.ok('nor by the service role',
    not has_function_privilege('service_role', 'public.stamp_check_in()', 'execute'));
  perform pg_temp.ok('and it pins its search path, as every function here does',
    (select 'search_path=' = any(proconfig) or proconfig::text like '%search_path=%'
       from pg_proc where oid = 'public.stamp_check_in()'::regprocedure));
  perform pg_temp.ok('row level security is on',
    (select relrowsecurity from pg_class where oid = 'public.check_ins'::regclass));
  perform pg_temp.eq('and anon was given nothing',
    (select count(*)::text from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'check_ins' and grantee = 'anon'), '0');

  ----------------------------------------------------------------------------
  -- The photograph bucket
  ----------------------------------------------------------------------------
  perform pg_temp.ok('the bucket is private',
    (select not public from storage.buckets where id = 'check-ins'));
  perform pg_temp.eq('and holds the same size limit as the others',
    (select file_size_limit::text from storage.buckets where id = 'check-ins'), '5242880');
  perform pg_temp.eq('objects can be read and written, and nothing else',
    (select count(*)::text from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'check_ins_storage%'), '2');

  ----------------------------------------------------------------------------
  -- The self-edit guard, reopened by this migration
  ----------------------------------------------------------------------------
  perform pg_temp.act_as(v_rep);
  perform pg_temp.refused('a rep cannot bind their own Telegram account',
    'update public.users set telegram_user_id = 4242 where id = ''' || v_rep || '''');
  perform pg_temp.refused('nor can they still change their own role',
    'update public.users set role_id = (select id from public.roles where key = ''system_admin'')
      where id = ''' || v_rep || '''');
  update public.users set nickname = 'Rep' where id = v_rep;
  perform pg_temp.eq('but a nickname is still theirs to set',
    (select nickname from public.users where id = v_rep), 'Rep');
  perform pg_temp.act_as_nobody();

  update public.users set telegram_user_id = 4242 where id = v_rep;
  perform pg_temp.eq('the route handler, holding the secret key, binds it',
    (select telegram_user_id::text from public.users where id = v_rep), '4242');
  perform pg_temp.rejects('and no second employee may claim the same account',
    'update public.users set telegram_user_id = 4242 where id = ''' || v_other || '''');
  perform pg_temp.ok('while any number of people may have none at all',
    (select telegram_user_id is null from public.users where id = v_other));

  ----------------------------------------------------------------------------
  -- Who sees whose, under the policies
  ----------------------------------------------------------------------------
  delete from public.check_ins;
  perform pg_temp.punch(v_rep,   'in',  now() - interval '3 hours');
  perform pg_temp.punch(v_rep,   'out', now() - interval '1 hour');
  perform pg_temp.punch(v_other, 'in',  now() - interval '2 hours');
  perform pg_temp.punch(v_sup,   'in',  now() - interval '4 hours');

  -- A suspension carries both dates, per users_suspension_dates_ck in 0002.
  update public.users
     set status = 'suspended',
         suspended_from = current_date,
         suspended_to = current_date + 7
   where id = v_gone;

  begin
    execute 'set local role authenticated';

    perform pg_temp.act_as(v_rep);
    perform pg_temp.eq('a rep sees their own two punches',
      (select count(*)::text from public.check_ins), '2');
    perform pg_temp.ok('and every one of them is theirs',
      (select bool_and(user_id = v_rep) from public.check_ins));
    perform pg_temp.refused('a rep cannot punch for somebody else',
      'insert into public.check_ins
         (user_id, kind, latitude, longitude, location_source, photo_path)
       values (''' || v_other || ''', ''in'', 11.5564, 104.9282, ''telegram'', ''p.jpg'')');
    insert into public.check_ins (kind, latitude, longitude, location_source, photo_path)
      values ('in', 11.5564, 104.9282, 'browser', 'p.jpg');
    perform pg_temp.eq('but punching for themselves goes through',
      (select count(*)::text from public.check_ins), '3');
    perform pg_temp.refused('and nobody may rewrite a punch once made',
      'update public.check_ins set note = ''second thoughts'' where user_id = ''' || v_rep || '''');
    perform pg_temp.refused('nor erase one',
      'delete from public.check_ins where user_id = ''' || v_rep || '''');

    perform pg_temp.act_as(v_sup);
    perform pg_temp.eq('the supervisor sees their own and their report''s',
      (select count(*)::text from public.check_ins), '4');
    perform pg_temp.eq('and not the unrelated rep''s',
      (select count(*)::text from public.check_ins where user_id = v_other), '0');

    perform pg_temp.act_as(v_hr);
    perform pg_temp.eq('HR sees all five',
      (select count(*)::text from public.check_ins), '5');

    perform pg_temp.act_as(v_sa);
    perform pg_temp.eq('so does the super admin',
      (select count(*)::text from public.check_ins), '5');
    perform pg_temp.refused('who still cannot rewrite one',
      'update public.check_ins set note = ''tidied'' where user_id = ''' || v_rep || '''');
    perform pg_temp.refused('or delete one',
      'delete from public.check_ins where user_id = ''' || v_rep || '''');

    perform pg_temp.act_as(v_gone);
    perform pg_temp.eq('a suspended employee sees nothing',
      (select count(*)::text from public.check_ins), '0');
    perform pg_temp.refused('and cannot punch at all',
      'insert into public.check_ins (kind, latitude, longitude, location_source, photo_path)
         values (''in'', 11.5564, 104.9282, ''telegram'', ''p.jpg'')');

    execute 'reset role';
    v_rls := 'ran';
  exception when insufficient_privilege then
    execute 'reset role';
    v_rls := 'skipped (cannot assume the authenticated role)';
  end;

  raise exception 'CHECK-INS OK - % assertions passed (rls: %)',
    current_setting('higtest.checks'), v_rls;
end;
$$;
