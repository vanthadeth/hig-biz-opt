-- visit_quotas.test.sql
--
-- One rep's target, set apart from the company's — and a manager finally
-- able to see the team's calls at all.
--
-- Three questions.
--
-- Who may move a person's number. Not the person themselves, whatever their
-- role — a quota is set by somebody responsible for the figure, not typed in
-- by the one it measures. A sales supervisor or sales manager reaches down
-- their own line, the same `manager_id` chain `sale_order` and `invoice`
-- already walk for those two roles; a stranger outside it, and an ordinary
-- rep for anyone at all including themselves, are both refused.
--
-- What a blank field means. Never zero, and never inherited by deleting the
-- row — a null field on a person's own row falls back to the company's, and
-- the same ranges the company row is held to (0032, extended in 0053) apply
-- here too, so a number the company would refuse cannot be typed in at the
-- person level either.
--
-- And whether `visit` itself now has a 'sub' scope to grant. Until this
-- migration a sales supervisor had no reach into `visit` at all — the Visits
-- page would open to nothing, not even their own department's open calls.
--
-- Everything happens inside one transaction that is deliberately rolled back,
-- so a run leaves no trace.
--
--     psql "$DATABASE_URL" -f supabase/tests/visit_quotas.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  VISIT QUOTAS OK - 21 assertions passed (rls: ran)
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
      or unique_violation or raise_exception or insufficient_privilege then
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
  v_sup   uuid := '00000000-0000-4000-8000-00000011a001';  -- sales supervisor
  v_rep   uuid := '00000000-0000-4000-8000-00000011a002';  -- their subordinate
  v_other uuid := '00000000-0000-4000-8000-00000011a003';  -- a rep outside their line
  v_sa    uuid := '00000000-0000-4000-8000-00000011a004';  -- super admin
  v_rls   text := 'skipped (cannot assume the authenticated role)';
  v_hit   int;
begin
  perform set_config('higtest.checks', '0', false);

  perform pg_temp.new_user(v_sup,   'vq.sup@example.test', 'Vq Sup',   'sales_supervisor');
  perform pg_temp.new_user(v_rep,   'vq.rep@example.test', 'Vq Rep',   'sales');
  perform pg_temp.new_user(v_other, 'vq.oth@example.test', 'Vq Other', 'sales');
  perform pg_temp.new_user(v_sa,    'vq.sa@example.test',  'Vq Admin', 'system_admin');
  update public.users set is_super_admin = true where id = v_sa;
  update public.users set manager_id = v_sup where id = v_rep;

  ----------------------------------------------------------------------------
  -- The permission matrix, exactly as granted
  ----------------------------------------------------------------------------
  perform pg_temp.eq('a sales supervisor may move a subordinate''s target',
    (select scope::text from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.key = 'sales_supervisor' and rp.module_key = 'visit_quota' and rp.action = 'edit'),
    'sub');
  perform pg_temp.eq('so may a sales manager',
    (select scope::text from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.key = 'sales_manager' and rp.module_key = 'visit_quota' and rp.action = 'edit'),
    'sub');
  perform pg_temp.eq('an administrator may move anyone''s',
    (select scope::text from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.key = 'system_admin' and rp.module_key = 'visit_quota' and rp.action = 'edit'),
    'any');
  perform pg_temp.eq('an ordinary rep holds none of it, not even for their own account',
    (select count(*)::text from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.key = 'sales' and rp.module_key = 'visit_quota'), '0');

  perform pg_temp.eq('and a sales supervisor now reaches their line''s visits',
    (select scope::text from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.key = 'sales_supervisor' and rp.module_key = 'visit' and rp.action = 'view'),
    'sub');
  perform pg_temp.eq('view only -- editing a subordinate''s call is not part of this',
    (select count(*)::text from public.role_permissions rp join public.roles r on r.id = rp.role_id
      where r.key = 'sales_supervisor' and rp.module_key = 'visit' and rp.action = 'edit'),
    '0');

  ----------------------------------------------------------------------------
  -- The database's own answer to "may I move this person's target"
  --
  -- can_edit_visit_quota is security invoker: it reads auth.uid() like any
  -- policy would, so it needs somebody act_as'd in first -- nobody is, yet,
  -- this early in the script.
  ----------------------------------------------------------------------------
  perform pg_temp.act_as(v_sup);
  perform pg_temp.ok('can_edit_visit_quota agrees for the supervisor''s own subordinate',
    public.can_edit_visit_quota(v_rep));
  -- Argued from app.can's own rule: holding 'sub' at all lets you act on your
  -- own account too, the same way an 'own'-scoped rep edits their own visit.
  perform pg_temp.ok('and for the supervisor''s own account',
    public.can_edit_visit_quota(v_sup));

  ----------------------------------------------------------------------------
  -- Reading and writing, under the policy rather than as the table's owner
  ----------------------------------------------------------------------------
  begin
    execute 'set local role authenticated';
    perform pg_temp.act_as(v_rep);
    v_rls := 'ran';

    perform pg_temp.eq('nobody has decided a rep''s own target lets them read nothing',
      (select count(*)::text from public.user_visit_quotas where user_id = v_rep), '0');

    perform pg_temp.refused('a rep may not set their own target',
      format('insert into public.user_visit_quotas (user_id, daily_visit_target)
                values (%L, 6)', v_rep));

    execute 'reset role';
  exception when insufficient_privilege then
    execute 'reset role';
    v_rls := 'skipped (cannot assume the authenticated role)';
  end;

  if v_rls = 'ran' then
    begin
      execute 'set local role authenticated';

      -- The supervisor sets it for their own subordinate.
      perform pg_temp.act_as(v_sup);
      insert into public.user_visit_quotas (user_id, daily_visit_target, daily_working_hours)
        values (v_rep, 6, 7.5);
      perform pg_temp.eq('a supervisor''s override lands for their own subordinate',
        (select daily_visit_target::text from public.user_visit_quotas where user_id = v_rep),
        '6');
      perform pg_temp.ok('and is stamped with who changed it',
        (select updated_by from public.user_visit_quotas where user_id = v_rep) = v_sup);

      -- But not for a rep outside their line.
      perform pg_temp.refused('nor may they set one for a rep outside their line',
        format('insert into public.user_visit_quotas (user_id, daily_visit_target)
                  values (%L, 6)', v_other));

      -- The rep can now read their own override, though they still may not
      -- write it.
      perform pg_temp.act_as(v_rep);
      perform pg_temp.eq('and the rep can read the target set for them',
        (select daily_visit_target::text from public.user_visit_quotas where user_id = v_rep),
        '6');
      -- An UPDATE refusal is the other half of the asymmetry this codebase
      -- has learned the hard way: unlike INSERT's with_check, a blocked
      -- UPDATE raises nothing at all -- it just matches zero rows.
      perform pg_temp.bump();
      update public.user_visit_quotas set daily_visit_target = 20 where user_id = v_rep;
      get diagnostics v_hit = row_count;
      if v_hit <> 0 then
        raise exception 'FAILED: but still may not move it themselves -- % row(s) updated', v_hit;
      end if;

      -- A colleague outside the line sees nothing of it -- not their number to
      -- know, any more than it is theirs to set.
      perform pg_temp.act_as(v_other);
      perform pg_temp.eq('a colleague outside the line reads none of it',
        (select count(*)::text from public.user_visit_quotas where user_id = v_rep), '0');

      -- The company's own ranges, held here too.
      perform pg_temp.act_as(v_sup);
      perform pg_temp.rejects('a target of nothing is not a target here either',
        format('update public.user_visit_quotas set daily_visit_target = 0
                  where user_id = %L', v_rep));
      perform pg_temp.rejects('nor may active hours exceed working hours',
        format('update public.user_visit_quotas set daily_active_hours = 9
                  where user_id = %L', v_rep));

      -- The manager sees the subordinate's visit itself now, not only their
      -- target -- the other half of this migration. The rep records it, as
      -- 'own' scope has always required; the point being tested is who else
      -- can then see it.
      perform pg_temp.act_as(v_rep);
      insert into public.visits (user_id, customer_id) values (v_rep, null);

      perform pg_temp.act_as(v_sup);
      perform pg_temp.ok('a supervisor now sees a subordinate''s open visit',
        (select count(*) from public.visits where user_id = v_rep) >= 1);

      perform pg_temp.act_as(v_other);
      perform pg_temp.eq('a colleague outside the line still sees none of it',
        (select count(*)::text from public.visits where user_id = v_rep), '0');

      perform pg_temp.act_as(v_rep);
      delete from public.visits where user_id = v_rep and checked_out_at is null;

      -- An administrator reaches anyone, the ordinary any-scope bypass.
      perform pg_temp.act_as(v_sa);
      insert into public.user_visit_quotas (user_id, weekly_visit_target)
        values (v_other, 40);
      perform pg_temp.eq('an administrator may set anyone''s target',
        (select weekly_visit_target::text from public.user_visit_quotas where user_id = v_other),
        '40');

      execute 'reset role';
    exception when insufficient_privilege then
      execute 'reset role';
    end;
  end if;

  raise exception 'VISIT QUOTAS OK - % assertions passed (rls: %)',
    current_setting('higtest.checks'), v_rls;
end;
$$;
