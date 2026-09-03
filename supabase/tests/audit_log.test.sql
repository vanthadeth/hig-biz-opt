-- audit_log.test.sql
--
-- The audit log's own suite. Separate from the others for the same reason they
-- are separate from each other: it needs its own fixtures, and folding it in
-- would make two suites harder to read than either is now.
--
-- Everything happens inside one transaction that is deliberately rolled back,
-- so a run leaves no trace.
--
--     psql "$DATABASE_URL" -f supabase/tests/audit_log.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  AUDIT OK - 35 assertions passed (rls: ran)
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

-- The newest entry for one table, which is what nearly every assertion here
-- wants to look at.
create or replace function pg_temp.latest(p_table text)
returns public.audit_log language sql as $f$
  select * from public.audit_log
   where table_name = p_table
   order by id desc
   limit 1;
$f$;

do $$
declare
  v_sa   uuid := '00000000-0000-4000-8000-0000000a0001';  -- super admin
  v_acc  uuid := '00000000-0000-4000-8000-0000000a0002';  -- accountant
  v_brd  uuid;
  v_itm  uuid;
  v_sales uuid;
  v_row  public.audit_log;
  v_base bigint;
  v_rls  text := 'skipped (cannot assume the authenticated role)';
begin
  perform set_config('higtest.checks', '0', false);

  -- Creating these two writes to public.users, which is audited. Taking the
  -- high-water mark now means every count below is about this test's own work.
  perform pg_temp.new_user(v_sa,  'ax.sa@example.test',  'Audit Admin', 'system_admin');
  perform pg_temp.new_user(v_acc, 'ax.acc@example.test', 'Audit Acct',  'accounting');
  update public.users set is_super_admin = true where id = v_sa;

  select coalesce(max(id), 0) into v_base from public.audit_log;

  ----------------------------------------------------------------------------
  -- The module was registered in 0007 and is now actually behind something
  ----------------------------------------------------------------------------
  perform pg_temp.eq('the audit log module is registered',
    (select href from public.modules where key = 'audit_log'), 'audit-log');
  perform pg_temp.eq('a super admin may read it',
    app.effective_scope(v_sa, 'audit_log', 'view')::text, 'any');
  perform pg_temp.eq('an accountant may not',
    app.effective_scope(v_acc, 'audit_log', 'view')::text, null);

  ----------------------------------------------------------------------------
  -- Creating, changing and removing a record each leave one entry
  ----------------------------------------------------------------------------
  perform pg_temp.act_as(v_sa);

  insert into public.brands (name) values ('AX Brand') returning id into v_brd;
  v_row := pg_temp.latest('brands');
  perform pg_temp.eq('creating a record is recorded', v_row.action::text, 'insert');
  perform pg_temp.eq('and names the record it was',
    v_row.new_row ->> 'name', 'AX Brand');
  perform pg_temp.eq('and identifies it by its key', v_row.record_id, v_brd::text);
  perform pg_temp.ok('and keeps nothing on the side the record came from',
    v_row.old_row is null);
  perform pg_temp.eq('and says who did it', v_row.actor_id::text, v_sa::text);
  -- Snapshotted, not joined: a person can be renamed or removed, and an entry
  -- that changes its own account of who acted is not an audit entry.
  perform pg_temp.eq('by the name they had at the time', v_row.actor_name, 'Audit Admin');

  update public.brands set description = 'A test brand' where id = v_brd;
  v_row := pg_temp.latest('brands');
  perform pg_temp.eq('changing one is recorded', v_row.action::text, 'update');
  perform pg_temp.eq('and lists exactly the columns that moved',
    v_row.changed::text, '{description}');
  perform pg_temp.eq('with the value it held before',
    coalesce(v_row.old_row ->> 'description', 'null'), 'null');
  perform pg_temp.eq('and the value it holds now',
    v_row.new_row ->> 'description', 'A test brand');

  -- The one that matters most, because the record itself is gone: the log is
  -- the only place left that says what it was.
  delete from public.brands where id = v_brd;
  v_row := pg_temp.latest('brands');
  perform pg_temp.eq('removing one is recorded', v_row.action::text, 'delete');
  perform pg_temp.eq('and keeps what it said', v_row.old_row ->> 'name', 'AX Brand');
  perform pg_temp.ok('with nothing on the arriving side', v_row.new_row is null);

  perform pg_temp.eq('three changes, three entries',
    (select count(*)::text from public.audit_log
      where table_name = 'brands' and id > v_base), '3');

  ----------------------------------------------------------------------------
  -- An update that changes nothing is not an event
  --
  -- A form that saves every field, including the ones nobody touched, still
  -- issues an UPDATE. updated_at moves on every one of those, which is why it
  -- is excluded from the comparison rather than counted as a change.
  ----------------------------------------------------------------------------
  insert into public.items (name_en) values ('AX Item') returning id into v_itm;
  select coalesce(max(id), 0) into v_base from public.audit_log;

  update public.items set name_en = name_en, price_usd = price_usd where id = v_itm;
  perform pg_temp.eq('an update that moves nothing leaves no entry',
    (select count(*)::text from public.audit_log where id > v_base), '0');

  update public.items set price_usd = 0.50 where id = v_itm;
  perform pg_temp.eq('but a real one does',
    (select count(*)::text from public.audit_log where id > v_base), '1');
  v_row := pg_temp.latest('items');
  perform pg_temp.eq('and updated_at is not itself a change',
    v_row.changed::text, '{price_usd}');
  perform pg_temp.ok('though the whole row is still kept',
    v_row.new_row ? 'updated_at');

  ----------------------------------------------------------------------------
  -- A composite key still identifies its record
  ----------------------------------------------------------------------------
  select r.id into v_sales from public.roles r where r.key = 'sales';
  insert into public.role_permissions (role_id, module_key, action, scope)
    values (v_sales, 'audit_log', 'view', 'any');
  v_row := pg_temp.latest('role_permissions');
  perform pg_temp.eq('a record with no id column is identified by its whole key',
    v_row.record_id, v_sales::text || ' / audit_log / view');

  ----------------------------------------------------------------------------
  -- What is not watched, deliberately
  ----------------------------------------------------------------------------
  perform pg_temp.eq('the log does not audit itself',
    (select count(*)::text from pg_trigger
      where tgrelid = 'public.audit_log'::regclass and not tgisinternal), '0');
  perform pg_temp.eq('nor the reference geography, which arrives in bulk',
    (select count(*)::text from pg_trigger
      where tgrelid in ('public.geo_provinces'::regclass, 'public.geo_districts'::regclass,
                        'public.geo_communes'::regclass)
        and not tgisinternal), '0');
  -- Everything a person edits, on the other hand, is watched. Naming the count
  -- means a table added later without a trigger fails here rather than quietly
  -- going unrecorded.
  perform pg_temp.eq('every table people edit carries the trigger',
    (select count(*)::text from pg_trigger t
      where t.tgname like '%\_audit' and not t.tgisinternal), '17');

  ----------------------------------------------------------------------------
  -- Append-only, and not by convention
  ----------------------------------------------------------------------------
  perform pg_temp.eq('the log has exactly one policy, and it is a read',
    (select string_agg(cmd, ',' order by cmd) from pg_policies
      where schemaname = 'public' and tablename = 'audit_log'), 'SELECT');
  perform pg_temp.ok('a signed-in user may read the log',
    has_table_privilege('authenticated', 'public.audit_log', 'select'));
  -- Supabase's default privileges grant every DML privilege on a new table in
  -- public, so this is the assertion that 0030's revoke actually happened.
  perform pg_temp.ok('and may not add to it, change it or empty it',
    not has_table_privilege('authenticated', 'public.audit_log', 'insert')
    and not has_table_privilege('authenticated', 'public.audit_log', 'update')
    and not has_table_privilege('authenticated', 'public.audit_log', 'delete')
    and not has_table_privilege('authenticated', 'public.audit_log', 'truncate'));
  -- The recorder is security definer, so leaving it callable by name would be
  -- handing out the ability to write the log directly. 0023 made the same point.
  perform pg_temp.ok('and the recorder is not callable as an RPC',
    not has_function_privilege('authenticated', 'public.record_audit()', 'execute'));

  ----------------------------------------------------------------------------
  -- Row level security
  ----------------------------------------------------------------------------
  begin
    execute 'set local role authenticated';

    perform pg_temp.act_as(v_acc);
    perform pg_temp.eq('an accountant sees no audit log at all',
      (select count(*)::text from public.audit_log), '0');
    -- No insert, update or delete grant, so the statement is refused before any
    -- policy is consulted. That is the point: there is nothing to get past.
    perform pg_temp.refused('and may not write to it',
      'insert into public.audit_log (table_name, action) values (''brands'', ''insert'')');

    perform pg_temp.act_as(v_sa);
    perform pg_temp.ok('a super admin reads it',
      (select count(*) from public.audit_log) > 0);
    perform pg_temp.refused('but may not rewrite an entry',
      'update public.audit_log set actor_name = ''Somebody Else''');
    perform pg_temp.refused('nor erase one',
      'delete from public.audit_log');

    -- Their own changes are recorded as theirs, under a policy rather than as
    -- the owner, which is the path the app actually takes.
    insert into public.brands (name) values ('AX Under RLS');
    perform pg_temp.eq('and a change made through a policy is still recorded',
      (select actor_id::text from public.audit_log
        where table_name = 'brands' order by id desc limit 1), v_sa::text);

    execute 'reset role';
    v_rls := 'ran';
  exception when insufficient_privilege then
    execute 'reset role';
    v_rls := 'skipped (cannot assume the authenticated role)';
  end;

  raise exception 'AUDIT OK - % assertions passed (rls: %)',
    current_setting('higtest.checks'), v_rls;
end;
$$;
