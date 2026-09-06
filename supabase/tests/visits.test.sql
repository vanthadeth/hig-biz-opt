-- visits.test.sql
--
-- The two rules 0046 exists to hold up.
--
-- One open visit per person, because that is what makes the centre button in
-- the bar unambiguous — with two open visits it would have to ask which one
-- "Check out" means, and the whole design of the app rests on it never having
-- to.
--
-- And the difference between evidence and a report. When the rep was in the
-- shop is stamped by the app and cannot be restated afterwards; what they
-- observed there can be corrected for a day. The window is the assertion worth
-- having in the database rather than only in the form, because the form is not
-- the only way to reach the row — the REST endpoint is right there, and a rule
-- only the form respects is not a rule.
--
-- Everything happens inside one transaction that is deliberately rolled back,
-- so a run leaves no trace.
--
--     psql "$DATABASE_URL" -f supabase/tests/visits.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  VISITS OK - 31 assertions passed (rls: ran)
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

create or replace function pg_temp.act_as(p_user uuid)
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end;
$f$;

-- Nobody signed in. The guard lets an unauthenticated caller through on
-- purpose — a migration or a backfill is not a person — and that is exactly
-- what lets this file set up a visit that was closed yesterday.
create or replace function pg_temp.act_as_nobody()
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', '{}', true);
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
  v_sa    uuid := '00000000-0000-4000-8000-0000000f0001';  -- super admin
  v_rep   uuid := '00000000-0000-4000-8000-0000000f0002';  -- the rep who visits
  v_rep2  uuid := '00000000-0000-4000-8000-0000000f0003';  -- a colleague
  v_shop  uuid;   -- the rep's own shop
  v_shop2 uuid;   -- the colleague's
  v_vis   uuid;   -- the visit the assertions follow
  v_old   uuid;   -- one closed more than a day ago
  v_rls   text := 'skipped (cannot assume the authenticated role)';
begin
  perform set_config('higtest.checks', '0', false);

  perform pg_temp.new_user(v_sa,   'v.sa@example.test',   'Visit Admin', 'system_admin');
  perform pg_temp.new_user(v_rep,  'v.rep@example.test',  'Visit Rep',   'sales');
  perform pg_temp.new_user(v_rep2, 'v.rep2@example.test', 'Visit Rep 2', 'sales');
  update public.users set is_super_admin = true where id = v_sa;

  insert into public.customers (shop_name, owner_id) values ('Visit Shop', v_rep)
    returning id into v_shop;
  insert into public.customers (shop_name, owner_id) values ('Other Shop', v_rep2)
    returning id into v_shop2;

  ----------------------------------------------------------------------------
  -- One shop at a time
  ----------------------------------------------------------------------------
  begin
    execute 'set local role authenticated';
    perform pg_temp.act_as(v_rep);
    v_rls := 'ran';

    insert into public.visits (customer_id) values (v_shop) returning id into v_vis;
    perform pg_temp.ok('a rep may check in', v_vis is not null);
    perform pg_temp.eq('and the visit is theirs without saying so',
      (select user_id::text from public.visits where id = v_vis), v_rep::text);
    perform pg_temp.ok('and it starts open',
      (select checked_out_at is null from public.visits where id = v_vis));

    -- The index that makes the bar's centre button unambiguous.
    perform pg_temp.rejects('a second open visit is refused',
      format('insert into public.visits (customer_id) values (%L)', v_shop));

    --------------------------------------------------------------------------
    -- Checking out is what files the record
    --------------------------------------------------------------------------
    perform pg_temp.rejects('checking out without answering is refused',
      format('update public.visits set checked_out_at = now() where id = %L', v_vis));

    update public.visits
       set visit_type = 'sales_call', status = 'completed',
           order_status = 'ordered', payment_status = 'paid_in_full',
           checked_out_at = now()
     where id = v_vis;
    perform pg_temp.ok('answered, it closes',
      (select checked_out_at is not null from public.visits where id = v_vis));

    perform pg_temp.eq('and the shop remembers being visited',
      (select last_visit_date::text from public.customers where id = v_shop),
      current_date::text);

    -- Closing one frees the rule, rather than blocking the rest of the round.
    -- Closed rather than deleted: the sales role holds no visit.delete, so a
    -- delete here would match nothing, raise nothing, and quietly leave an open
    -- visit for the later assertions to trip over.
    insert into public.visits (customer_id) values (v_shop2);
    perform pg_temp.eq('with that one closed, the next check-in is allowed',
      (select count(*)::text from public.visits where user_id = v_rep), '2');

    update public.visits
       set visit_type = 'follow_up', status = 'owner_away',
           order_status = 'no_order', payment_status = 'nothing_due',
           checked_out_at = now()
     where user_id = v_rep and checked_out_at is null;
    perform pg_temp.ok('and the round ends with nothing left open',
      (select count(*) = 0 from public.visits
        where user_id = v_rep and checked_out_at is null));

    --------------------------------------------------------------------------
    -- The stamps are evidence
    --------------------------------------------------------------------------
    perform pg_temp.rejects('when a visit started cannot be changed',
      format('update public.visits set checked_in_at = now() - interval ''3 hours''
              where id = %L', v_vis));
    perform pg_temp.rejects('nor where the phone was when it started',
      format('update public.visits set checked_in_latitude = 11.5,
                checked_in_longitude = 104.9 where id = %L', v_vis));
    perform pg_temp.rejects('and when it ended is written once, not edited',
      format('update public.visits set checked_out_at = now() - interval ''1 hour''
              where id = %L', v_vis));

    -- What was observed is a different kind of fact, and moves freely today.
    update public.visits set order_status = 'no_order', remarks = 'Reordered next week'
     where id = v_vis;
    perform pg_temp.eq('but what the rep observed may still be corrected',
      (select order_status::text from public.visits where id = v_vis), 'no_order');

    execute 'reset role';
  exception when insufficient_privilege then
    execute 'reset role';
  end;

  ----------------------------------------------------------------------------
  -- A day later
  --
  -- Set up with nobody signed in, because back-dating the stamp is exactly what
  -- the guard refuses to a person -- which is the point being tested.
  ----------------------------------------------------------------------------
  perform pg_temp.act_as_nobody();
  insert into public.visits (
    customer_id, user_id, checked_in_at, checked_out_at,
    visit_type, status, order_status, payment_status
  ) values (
    v_shop, v_rep, now() - interval '26 hours', now() - interval '25 hours',
    'collection', 'completed', 'no_order', 'partial_payment'
  ) returning id into v_old;

  begin
    execute 'set local role authenticated';

    perform pg_temp.act_as(v_rep);
    perform pg_temp.rejects('a visit closed more than a day ago is no longer the rep''s to edit',
      format('update public.visits set remarks = ''Second thoughts'' where id = %L', v_old));
    perform pg_temp.ok('and it did not change',
      (select remarks is null from public.visits where id = v_old));

    -- The escape hatch is scope, and it is deliberate: 'any' is given to
    -- somebody on purpose, and a correction to week-old history should be
    -- theirs rather than nobody's. The audit log is what makes that safe.
    perform pg_temp.act_as(v_sa);
    update public.visits set remarks = 'Corrected by the supervisor' where id = v_old;
    perform pg_temp.eq('but an administrator may still correct it',
      (select remarks from public.visits where id = v_old), 'Corrected by the supervisor');

    perform pg_temp.rejects('though not the stamps, at any age or scope',
      format('update public.visits set checked_in_at = now() where id = %L', v_old));

    execute 'reset role';
  exception when insufficient_privilege then
    execute 'reset role';
  end;

  ----------------------------------------------------------------------------
  -- The date on the customer only ever moves forward
  ----------------------------------------------------------------------------
  perform pg_temp.act_as_nobody();
  update public.customers set last_visit_date = current_date + 3 where id = v_shop;

  insert into public.visits (
    customer_id, user_id, visit_type, status, order_status, payment_status
  ) values (v_shop, v_rep2, 'delivery', 'completed', 'no_order', 'nothing_due');
  update public.visits set checked_out_at = now()
   where user_id = v_rep2 and checked_out_at is null;

  perform pg_temp.eq('a visit filed late does not rewind the customer''s date',
    (select last_visit_date::text from public.customers where id = v_shop),
    (current_date + 3)::text);

  ----------------------------------------------------------------------------
  -- Whose visit it is
  --
  -- The seeded sales role holds visit.view at 'own', unlike sale_order which is
  -- at 'sub'. A round is a person's own day, and one rep reading another's is a
  -- supervisor's question -- which is what the Roles screen is for.
  ----------------------------------------------------------------------------
  begin
    execute 'set local role authenticated';

    perform pg_temp.act_as(v_rep);
    perform pg_temp.eq('a rep sees their own visit',
      (select count(*)::text from public.visits where id = v_vis), '1');
    perform pg_temp.eq('and reads it with the shop''s name on it',
      (select shop_name from public.visit_log where id = v_vis), 'Visit Shop');

    perform pg_temp.act_as(v_rep2);
    perform pg_temp.eq('a colleague does not',
      (select count(*)::text from public.visits where id = v_vis), '0');
    perform pg_temp.eq('through the view either',
      (select count(*)::text from public.visit_log where id = v_vis), '0');

    perform pg_temp.act_as(v_sa);
    perform pg_temp.eq('an administrator sees it',
      (select count(*)::text from public.visits where id = v_vis), '1');

    -- A refused delete matches no rows and raises nothing, so what is left
    -- afterwards is the only proof it was refused.
    perform pg_temp.act_as(v_rep);
    delete from public.visits where id = v_vis;
    perform pg_temp.act_as(v_sa);
    perform pg_temp.eq('a rep may not delete a visit, because it is evidence',
      (select count(*)::text from public.visits where id = v_vis), '1');

    execute 'reset role';
  exception when insufficient_privilege then
    execute 'reset role';
  end;

  ----------------------------------------------------------------------------
  -- You cannot visit a shop you could not have seen
  --
  -- The seeded sales role reads customers at 'any', so this narrows one rep to
  -- their own shops and then tries the colleague's. Without the second half of
  -- the insert policy the customer id would be an unchecked reference into a
  -- table whose whole point is that not everybody sees all of it.
  ----------------------------------------------------------------------------
  perform pg_temp.act_as_nobody();
  insert into public.user_permission_overrides (user_id, module_key, action, effect, scope)
    values (v_rep, 'customer', 'view', 'allow', 'own');

  begin
    execute 'set local role authenticated';
    perform pg_temp.act_as(v_rep);

    perform pg_temp.eq('the shop is now invisible to them',
      (select count(*)::text from public.customers where id = v_shop2), '0');
    perform pg_temp.rejects('so checking in there is refused',
      format('insert into public.visits (customer_id) values (%L)', v_shop2));
    perform pg_temp.ok('while their own shop is still fine',
      (select count(*) = 1 from public.customers where id = v_shop));

    execute 'reset role';
  exception when insufficient_privilege then
    execute 'reset role';
  end;

  ----------------------------------------------------------------------------
  -- The shape of the row
  ----------------------------------------------------------------------------
  perform pg_temp.act_as_nobody();
  perform pg_temp.rejects('half a coordinate locates nothing',
    format('insert into public.visits (customer_id, user_id, checked_in_latitude)
            values (%L, %L, 11.5)', v_shop, v_sa));
  perform pg_temp.rejects('and a visit cannot end before it started',
    format('insert into public.visits (customer_id, user_id, checked_in_at, checked_out_at,
              visit_type, status, order_status, payment_status)
            values (%L, %L, now(), now() - interval ''1 hour'',
              ''delivery'', ''completed'', ''no_order'', ''nothing_due'')', v_shop, v_sa));

  perform pg_temp.eq('a visit is on the audited list',
    (select count(*)::text from pg_catalog.pg_trigger
      where tgrelid = 'public.visits'::regclass and tgname = 'visits_audit'), '1');

  raise exception 'VISITS OK - % assertions passed (rls: %)',
    current_setting('higtest.checks'), v_rls;
end;
$$;
