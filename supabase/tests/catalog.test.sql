-- catalog.test.sql
--
-- The cart, which is the one thing 0035 added that is nobody's but yours.
--
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
--     ERROR:  CATALOG OK - 23 assertions passed (rls: ran)
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
  v_rep  uuid := '00000000-0000-4000-8000-0000000c0002';  -- a sales rep
  v_rep2 uuid := '00000000-0000-4000-8000-0000000c0003';  -- another sales rep
  v_itm  uuid;   -- something to put in a cart
  v_alt  uuid;   -- something else
  v_line uuid;   -- the rep's line
  v_rls  text := 'skipped (cannot assume the authenticated role)';
begin
  perform set_config('higtest.checks', '0', false);

  perform pg_temp.new_user(v_sa,   'cx.sa@example.test',   'Cart Admin', 'system_admin');
  perform pg_temp.new_user(v_rep,  'cx.rep@example.test',  'Cart Rep',   'sales');
  perform pg_temp.new_user(v_rep2, 'cx.rep2@example.test', 'Cart Rep 2', 'sales');
  update public.users set is_super_admin = true where id = v_sa;

  insert into public.items (name_en, code, price_usd, price_khr, stock_qty)
    values ('CX Water', 'CX-001', 0.50, 2000, 10) returning id into v_itm;
  insert into public.items (name_en, code, price_usd, stock_qty)
    values ('CX Rice', 'CX-002', 12, 4) returning id into v_alt;

  ----------------------------------------------------------------------------
  -- The shape of a line
  ----------------------------------------------------------------------------
  insert into public.cart_lines (user_id, item_id) values (v_rep, v_itm)
    returning id into v_line;

  perform pg_temp.eq('a line starts at one',
    (select quantity::text from public.cart_lines where id = v_line), '1');

  -- A line of nothing is not a line; removing it is what "none" means, and a
  -- zero row left behind would make an empty cart look like a cart.
  perform pg_temp.rejects('a line of nothing is not a line',
    format('update public.cart_lines set quantity = 0 where id = %L', v_line));
  perform pg_temp.rejects('nor is a negative one',
    format('update public.cart_lines set quantity = -3 where id = %L', v_line));

  -- Adding an item already in the cart must raise its quantity rather than
  -- make a second line, and the unique index is what makes that an upsert
  -- instead of a race between two taps.
  perform pg_temp.rejects('one line per item per person',
    format('insert into public.cart_lines (user_id, item_id) values (%L, %L)', v_rep, v_itm));
  -- The same item in somebody else's cart is not a clash.
  insert into public.cart_lines (user_id, item_id, quantity) values (v_rep2, v_itm, 5);
  perform pg_temp.eq('but two people may each hold the same item',
    (select count(*)::text from public.cart_lines where item_id = v_itm), '2');

  perform pg_temp.rejects('a line must name an item that exists',
    format('insert into public.cart_lines (user_id, item_id) values (%L, %L)',
           v_rep, '00000000-0000-4000-8000-00000000dead'));

  -- Backdated first, because now() is fixed for the whole transaction: left as
  -- it was, `updated_at > created_at` would be false however well the trigger
  -- worked, and the assertion would be testing the clock rather than the code.
  update public.cart_lines set updated_at = now() - interval '1 day' where id = v_line;
  update public.cart_lines set quantity = 3 where id = v_line;
  perform pg_temp.ok('a changed line is stamped',
    (select updated_at = created_at from public.cart_lines where id = v_line));

  ----------------------------------------------------------------------------
  -- What a cart is attached to
  --
  -- Nothing turns a cart into an order yet, so the only lifecycles that touch
  -- it are the item's and the person's. Both take their lines with them: a
  -- line pointing at a deleted item is a row nobody can render, and a cart
  -- belonging to a deleted account is a row nobody can claim.
  ----------------------------------------------------------------------------
  insert into public.cart_lines (user_id, item_id, quantity) values (v_rep, v_alt, 2);
  delete from public.items where id = v_alt;
  perform pg_temp.eq('deleting an item takes it out of every cart',
    (select count(*)::text from public.cart_lines where item_id = v_alt), '0');

  perform pg_temp.eq('there is no cart header to strand a line on',
    (select count(*)::text from information_schema.tables
      where table_schema = 'public' and table_name in ('carts', 'cart')), '0');

  ----------------------------------------------------------------------------
  -- Privileges
  --
  -- Supabase grants `authenticated` every DML verb on a new table in `public`
  -- by default, so a policy is only half the story: the revoke is what makes
  -- the grant below mean something rather than restate what was already there.
  ----------------------------------------------------------------------------
  perform pg_temp.eq('a person may do all four things to a cart line',
    (select string_agg(distinct lower(privilege_type), ',' order by lower(privilege_type))
       from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'cart_lines'
        and grantee = 'authenticated'),
    'delete,insert,select,update');
  perform pg_temp.eq('and anon may do none of them',
    (select count(*)::text from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'cart_lines' and grantee = 'anon'), '0');
  perform pg_temp.ok('row level security is on',
    (select relrowsecurity from pg_class where oid = 'public.cart_lines'::regclass));

  ----------------------------------------------------------------------------
  -- Row level security
  --
  -- A cart is yours. Not a module permission: there is no version of this
  -- where one person edits another's cart, so there is nothing to grant and
  -- nothing an administrator can do about it either.
  ----------------------------------------------------------------------------
  begin
    execute 'set local role authenticated';

    perform pg_temp.act_as(v_rep);
    perform pg_temp.eq('a rep sees their own line',
      (select count(*)::text from public.cart_lines where id = v_line), '1');
    perform pg_temp.eq('and only their own',
      (select count(*)::text from public.cart_lines), '1');

    -- The column defaults to the caller rather than being sent, so a client
    -- cannot write a line into somebody else's cart even by naming them.
    insert into public.cart_lines (item_id, quantity) values (v_itm, 2)
      on conflict (user_id, item_id) do update set quantity = 9;
    perform pg_temp.eq('an added line lands in the caller''s own cart',
      (select quantity::text from public.cart_lines where id = v_line), '9');
    perform pg_temp.refused('and a line addressed to somebody else is refused outright',
      format('insert into public.cart_lines (user_id, item_id, quantity)
                values (%L, %L, 1)', v_rep2, v_itm));

    -- A refused update matches no rows and raises nothing at all, so the value
    -- afterwards is the only thing that proves it was refused.
    update public.cart_lines set quantity = 99 where user_id = v_rep2;
    perform pg_temp.act_as(v_rep2);
    perform pg_temp.eq('one rep may not change another''s quantities',
      (select quantity::text from public.cart_lines where user_id = v_rep2), '5');
    delete from public.cart_lines where user_id = v_rep;
    perform pg_temp.act_as(v_rep);
    perform pg_temp.eq('nor empty their cart for them',
      (select count(*)::text from public.cart_lines where user_id = v_rep), '1');

    -- Removing a line is how you take something out, and it is the one delete
    -- in this app that needs no permission at all.
    delete from public.cart_lines where id = v_line;
    perform pg_temp.eq('but you may empty your own',
      (select count(*)::text from public.cart_lines where user_id = v_rep), '0');

    -- Being an administrator is not being somebody else. There is no policy
    -- that reads a module here, so the super admin bypass has nothing to bypass.
    perform pg_temp.act_as(v_sa);
    perform pg_temp.eq('not even an administrator sees another person''s cart',
      (select count(*)::text from public.cart_lines), '0');
    update public.cart_lines set quantity = 1 where user_id = v_rep2;
    perform pg_temp.act_as(v_rep2);
    perform pg_temp.eq('nor changes one',
      (select quantity::text from public.cart_lines where user_id = v_rep2), '5');

    execute 'reset role';
    v_rls := 'ran';
  exception when insufficient_privilege then
    execute 'reset role';
    v_rls := 'skipped (cannot assume the authenticated role)';
  end;

  ----------------------------------------------------------------------------
  -- The person's own lifecycle
  --
  -- Outside the RLS block: removing an employee record is an administrator's
  -- act, not something a policy on this table decides. The cascade is off
  -- public.users rather than auth.users, because 0016 cut the two apart so an
  -- employee can exist without a login — a cart belongs to the employee.
  ----------------------------------------------------------------------------
  perform pg_temp.eq('a cart line hangs off the employee record',
    (select confdeltype::text from pg_constraint where conname = 'cart_lines_user_id_fkey'), 'c');
  -- As the administrator, because 0030 stamps the actor on the delete and the
  -- audit row's actor may not be the row being deleted.
  perform pg_temp.act_as(v_sa);
  delete from public.users where id = v_rep2;
  perform pg_temp.eq('and a removed employee takes their cart with them',
    (select count(*)::text from public.cart_lines where user_id = v_rep2), '0');

  raise exception 'CATALOG OK - % assertions passed (rls: %)',
    current_setting('higtest.checks'), v_rls;
end;
$$;
