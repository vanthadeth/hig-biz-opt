-- access_model.test.sql
--
-- The access rules are the part of this system where a bug leaks payroll data
-- rather than misaligning a button, so they get a suite that can be re-run after
-- every migration.
--
-- Everything happens inside one transaction that is deliberately rolled back, so
-- a run leaves no trace: no fixtures, no sequence drift, and not even a
-- supabase_migrations row when it is applied through a migration API.
--
--     psql "$DATABASE_URL" -f supabase/tests/access_model.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  ACCESS MODEL OK - 147 assertions passed (rls: ran)
--
-- Anything else is a real failure and names the assertion that broke:
--
--     ERROR:  FAILED: deny override beats role grant -- expected null, got any
--
-- The fixtures are self-contained: they do not read the seeded employee, so this
-- runs against a freshly migrated database as well as a populated one.

-- Assertion helpers. pg_temp is session-local, so these never touch the schema.
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

create or replace function pg_temp.notok(p_label text, p_actual boolean)
returns void language plpgsql as $f$
begin
  perform pg_temp.bump();
  if p_actual is distinct from false then
    raise exception 'FAILED: % -- expected false, got %', p_label, coalesce(p_actual::text, 'null');
  end if;
end;
$f$;

-- Asserts that a statement is refused. Used for the CHECK constraints, where the
-- point is that the database says no.
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

-- Like `rejects`, but for a statement a row level security policy turns away.
-- A policy violation raises insufficient_privilege, not a constraint error, so
-- it needs its own catch — and catching only that one means a genuine
-- constraint failure still surfaces as a failure rather than passing quietly.
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

-- Becomes a given user, for the functions that read auth.uid().
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
  -- Inserting into auth.users exercises handle_new_auth_user from 0002, which is
  -- what provisions the profile row and resolves the role from the metadata.
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
  v_mgr uuid := '00000000-0000-4000-8000-0000000f0001';  -- sales, no manager
  v_rep uuid := '00000000-0000-4000-8000-0000000f0002';  -- sales, reports to mgr
  v_jr  uuid := '00000000-0000-4000-8000-0000000f0003';  -- sales, reports to rep
  v_wh  uuid := '00000000-0000-4000-8000-0000000f0004';  -- warehouse
  v_sa  uuid := '00000000-0000-4000-8000-0000000f0005';  -- super admin, active
  v_sus uuid := '00000000-0000-4000-8000-0000000f0006';  -- super admin, suspended
  v_dis uuid := '00000000-0000-4000-8000-0000000f0007';  -- sales, discharged
  v_nol uuid;                                            -- an employee with no login
  v_new uuid := '00000000-0000-4000-8000-0000000f00aa';  -- the login they are later given
  v_prn uuid;                                            -- a printer, for the settings policy
  v_dep uuid;                                            -- a department, for the same policy
  v_vic uuid;                                            -- a record created only to be deleted
  v_hit int;                                             -- rows a statement actually touched
  v_rls text := 'skipped (cannot assume the authenticated role)';
begin
  perform set_config('higtest.checks', '0', false);

  ----------------------------------------------------------------------------
  -- Fixtures
  ----------------------------------------------------------------------------
  perform pg_temp.new_user(v_mgr, 'fx.mgr@example.test', 'Fixture Manager',   'sales');
  perform pg_temp.new_user(v_rep, 'fx.rep@example.test', 'Fixture Rep',       'sales');
  perform pg_temp.new_user(v_jr,  'fx.jr@example.test',  'Fixture Junior',    'sales');
  perform pg_temp.new_user(v_wh,  'fx.wh@example.test',  'Fixture Warehouse', 'warehouse');
  perform pg_temp.new_user(v_sa,  'fx.sa@example.test',  'Fixture Admin',     'system_admin');
  perform pg_temp.new_user(v_sus, 'fx.sus@example.test', 'Fixture Suspended', 'system_admin');
  perform pg_temp.new_user(v_dis, 'fx.dis@example.test', 'Fixture Discharged','sales');

  -- The trigger provisioned every profile; check that before relying on it.
  perform pg_temp.eq('trigger provisions a profile row',
    (select count(*)::text from public.users where email like 'fx.%@example.test'), '7');
  perform pg_temp.eq('trigger resolves role from metadata',
    (select r.key from public.users u join public.roles r on r.id = u.role_id where u.id = v_wh),
    'warehouse');

  -- junior -> rep -> manager, a two-level chain for `sub` scope.
  update public.users set manager_id = v_mgr where id = v_rep;
  update public.users set manager_id = v_rep where id = v_jr;

  update public.users set is_super_admin = true where id in (v_sa, v_sus);
  update public.users
     set status = 'suspended', suspended_from = current_date, suspended_to = current_date + 30
   where id = v_sus;
  update public.users
     set status = 'discharged', discharged_date = current_date
   where id = v_dis;

  ----------------------------------------------------------------------------
  -- app.is_subordinate
  ----------------------------------------------------------------------------
  perform pg_temp.ok('subordinate: direct report',        app.is_subordinate(v_mgr, v_rep));
  perform pg_temp.ok('subordinate: two levels down',      app.is_subordinate(v_mgr, v_jr));
  perform pg_temp.ok('subordinate: direct, lower level',  app.is_subordinate(v_rep, v_jr));
  perform pg_temp.notok('subordinate: upward is not',     app.is_subordinate(v_jr, v_mgr));
  perform pg_temp.notok('subordinate: unrelated is not',  app.is_subordinate(v_wh, v_rep));
  perform pg_temp.notok('subordinate: self is not',       app.is_subordinate(v_rep, v_rep));

  ----------------------------------------------------------------------------
  -- app.effective_scope: role defaults
  ----------------------------------------------------------------------------
  perform pg_temp.eq('sales: customer.view',    app.effective_scope(v_rep, 'customer', 'view')::text,   'any');
  perform pg_temp.eq('sales: customer.add',     app.effective_scope(v_rep, 'customer', 'add')::text,    'own');
  perform pg_temp.eq('sales: sale_order.view',  app.effective_scope(v_rep, 'sale_order', 'view')::text, 'sub');
  perform pg_temp.eq('sales: payment.view',     app.effective_scope(v_rep, 'payment', 'view')::text,    'own');
  perform pg_temp.eq('sales: product.view',     app.effective_scope(v_rep, 'product', 'view')::text,    'any');
  perform pg_temp.eq('sales: no user.view',     app.effective_scope(v_rep, 'user', 'view')::text,       null);
  perform pg_temp.eq('sales: no customer.delete', app.effective_scope(v_rep, 'customer', 'delete')::text, null);

  perform pg_temp.eq('warehouse: product.edit', app.effective_scope(v_wh, 'product', 'edit')::text,   'any');
  perform pg_temp.eq('warehouse: customer.view',app.effective_scope(v_wh, 'customer', 'view')::text,  'sub');
  perform pg_temp.eq('warehouse: no invoice',   app.effective_scope(v_wh, 'invoice', 'view')::text,   null);

  perform pg_temp.eq('super admin: user.delete',  app.effective_scope(v_sa, 'user', 'delete')::text,   'any');
  perform pg_temp.eq('super admin: audit_log.view', app.effective_scope(v_sa, 'audit_log', 'view')::text, 'any');

  perform pg_temp.eq('unknown module resolves to nothing',
    app.effective_scope(v_rep, 'not_a_module', 'view')::text, null);
  perform pg_temp.eq('unknown user resolves to nothing',
    app.effective_scope('00000000-0000-4000-8000-0000000fdead', 'customer', 'view')::text, null);
  perform pg_temp.eq('null user resolves to nothing',
    app.effective_scope(null, 'customer', 'view')::text, null);

  ----------------------------------------------------------------------------
  -- Status is checked before is_super_admin, on purpose
  ----------------------------------------------------------------------------
  perform pg_temp.eq('suspended super admin loses everything',
    app.effective_scope(v_sus, 'user', 'view')::text, null);
  perform pg_temp.eq('suspended super admin loses settings too',
    app.effective_scope(v_sus, 'settings', 'edit')::text, null);
  perform pg_temp.eq('discharged employee loses everything',
    app.effective_scope(v_dis, 'customer', 'view')::text, null);

  ----------------------------------------------------------------------------
  -- Per-user overrides, in both directions
  ----------------------------------------------------------------------------
  insert into public.user_permission_overrides (user_id, module_key, action, scope)
  values
    (v_rep, 'customer', 'view', 'deny'),  -- role grants 'any'
    (v_rep, 'user',     'view', 'own'),   -- role grants nothing
    (v_rep, 'product',  'view', 'own');   -- role grants 'any', narrowed

  perform pg_temp.eq('deny override beats role grant',
    app.effective_scope(v_rep, 'customer', 'view')::text, null);
  perform pg_temp.eq('allow override grants what the role lacks',
    app.effective_scope(v_rep, 'user', 'view')::text, 'own');
  perform pg_temp.eq('allow override can narrow a role grant',
    app.effective_scope(v_rep, 'product', 'view')::text, 'own');
  perform pg_temp.eq('untouched action keeps its role scope',
    app.effective_scope(v_rep, 'sale_order', 'view')::text, 'sub');
  perform pg_temp.eq('override does not leak to another user',
    app.effective_scope(v_jr, 'customer', 'view')::text, 'any');
  perform pg_temp.eq('a deny cannot override a super admin''s status-based loss',
    app.effective_scope(v_sus, 'customer', 'view')::text, null);

  ----------------------------------------------------------------------------
  -- `deny` as a stored scope
  ----------------------------------------------------------------------------
  -- An explicit denial on the role reads the same as no grant at all once
  -- resolved, but is a recorded decision rather than an omission.
  insert into public.role_permissions (role_id, module_key, action, scope)
  select r.id, 'audit_log', 'view', 'deny' from public.roles r where r.key = 'warehouse'
  on conflict (role_id, module_key, action) do update set scope = 'deny';

  perform pg_temp.eq('a role-level deny resolves to no access',
    app.effective_scope(v_wh, 'audit_log', 'view')::text, null);
  perform pg_temp.eq('the deny is stored, not just absent',
    (select rp.scope::text from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
     where r.key = 'warehouse' and rp.module_key = 'audit_log' and rp.action = 'view'),
    'deny');

  -- An override may also grant where the role denies.
  insert into public.user_permission_overrides (user_id, module_key, action, scope)
  values (v_wh, 'audit_log', 'view', 'any');
  perform pg_temp.eq('an override outranks a role-level deny',
    app.effective_scope(v_wh, 'audit_log', 'view')::text, 'any');
  delete from public.user_permission_overrides
   where user_id = v_wh and module_key = 'audit_log';

  ----------------------------------------------------------------------------
  -- app.can: scope tested against a record's owner
  ----------------------------------------------------------------------------
  -- The junior still has customer.view at 'any'; the rep's was denied above.
  perform pg_temp.act_as(v_jr);
  perform pg_temp.ok('can: any scope reaches an unrelated owner',
    app.can('customer', 'view', v_wh));

  perform pg_temp.act_as(v_rep);
  perform pg_temp.ok('can: sub scope reaches a subordinate',   app.can('sale_order', 'view', v_jr));
  perform pg_temp.ok('can: sub scope reaches self',            app.can('sale_order', 'view', v_rep));
  perform pg_temp.notok('can: sub scope does not reach upward',app.can('sale_order', 'view', v_mgr));
  perform pg_temp.notok('can: sub scope does not reach sideways', app.can('sale_order', 'view', v_wh));
  perform pg_temp.ok('can: own scope reaches self',            app.can('payment', 'view', v_rep));
  perform pg_temp.notok('can: own scope does not reach a subordinate', app.can('payment', 'view', v_jr));
  perform pg_temp.notok('can: a denied module is refused',     app.can('customer', 'view', v_rep));
  perform pg_temp.ok('can: no owner asks only whether it is held', app.can('sale_order', 'view'));
  perform pg_temp.notok('can: no owner, permission not held',  app.can('audit_log', 'view'));

  perform pg_temp.act_as(v_sa);
  perform pg_temp.ok('can: super admin reaches anyone',        app.can('user', 'edit', v_rep));
  perform pg_temp.act_as(v_sus);
  perform pg_temp.notok('can: suspended super admin reaches no one', app.can('user', 'edit', v_rep));

  ----------------------------------------------------------------------------
  -- app.my_views
  ----------------------------------------------------------------------------
  perform pg_temp.act_as(v_rep);
  perform pg_temp.eq('my_views: role default',
    (select string_agg(name, ', ' order by sort_order) from app.my_views()), 'Sale');

  insert into public.user_views (user_id, view_key, effect) values (v_rep, 'accounting', 'allow');
  perform pg_temp.eq('my_views: plus a per-user grant',
    (select string_agg(name, ', ' order by sort_order) from app.my_views()), 'Sale, Accountant');

  insert into public.user_views (user_id, view_key, effect) values (v_rep, 'sales', 'deny');
  perform pg_temp.eq('my_views: a deny beats the role default',
    (select string_agg(name, ', ' order by sort_order) from app.my_views()), 'Accountant');

  perform pg_temp.act_as(v_jr);
  perform pg_temp.eq('my_views: untouched user keeps the role default',
    (select string_agg(name, ', ' order by sort_order) from app.my_views()), 'Sale');

  perform pg_temp.act_as(v_sa);
  perform pg_temp.eq('my_views: super admin reaches every active view',
    (select count(*)::text from app.my_views()),
    (select count(*)::text from public.views where active));

  perform pg_temp.act_as(v_sus);
  perform pg_temp.eq('my_views: suspended user reaches none',
    (select count(*)::text from app.my_views()), '0');
  perform pg_temp.act_as(v_dis);
  perform pg_temp.eq('my_views: discharged user reaches none',
    (select count(*)::text from app.my_views()), '0');

  ----------------------------------------------------------------------------
  -- app.my_nav: navigation and permissions cannot disagree
  ----------------------------------------------------------------------------
  perform pg_temp.act_as(v_jr);
  perform pg_temp.eq('my_nav: the full sale nav set',
    (select string_agg(name, ', ' order by sort_order) from app.my_nav('sales')),
    'Customer, Sales Order, Payment, Product');

  perform pg_temp.act_as(v_rep);
  perform pg_temp.eq('my_nav: a denied module drops out of the nav set',
    (select string_agg(name, ', ' order by sort_order) from app.my_nav('accounting')),
    'Invoice, Payment, Sales Order');
  perform pg_temp.eq('my_nav: an unentitled view returns nothing',
    (select count(*)::text from app.my_nav('admin')), '0');
  perform pg_temp.eq('my_nav: a revoked view returns nothing',
    (select count(*)::text from app.my_nav('sales')), '0');
  perform pg_temp.eq('my_nav: an unknown view returns nothing',
    (select count(*)::text from app.my_nav('not_a_view')), '0');

  perform pg_temp.act_as(v_wh);
  perform pg_temp.eq('my_nav: warehouse nav set',
    (select string_agg(name, ', ' order by sort_order) from app.my_nav('warehouse')),
    'Product, Sales Order, Settings');

  ----------------------------------------------------------------------------
  -- app.my_permissions
  ----------------------------------------------------------------------------
  perform pg_temp.act_as(v_rep);
  perform pg_temp.eq('my_permissions: reports the overridden scope',
    (select scope::text from app.my_permissions() where module_key = 'user' and action = 'view'),
    'own');
  perform pg_temp.eq('my_permissions: omits a denied action',
    (select count(*)::text from app.my_permissions() where module_key = 'customer' and action = 'view'),
    '0');
  perform pg_temp.eq('my_permissions: never reports a null scope',
    (select count(*)::text from app.my_permissions() where scope is null), '0');
  -- `deny` is a stored decision, not a reach; it must never reach a caller.
  perform pg_temp.eq('my_permissions: never reports deny',
    (select count(*)::text from app.my_permissions() where scope::text = 'deny'), '0');
  perform pg_temp.act_as(v_sus);
  perform pg_temp.eq('my_permissions: suspended user holds none',
    (select count(*)::text from app.my_permissions()), '0');

  ----------------------------------------------------------------------------
  -- The columns the directory deliberately does not carry
  ----------------------------------------------------------------------------
  perform pg_temp.eq('user_directory hides date_of_birth',
    (select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name = 'user_directory'
        and column_name = 'date_of_birth'), '0');
  perform pg_temp.eq('user_directory hides the bank columns',
    (select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name = 'user_directory'
        and column_name like 'bank\_%'), '0');
  perform pg_temp.ok('user_directory still carries the contact columns',
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'user_directory'
        and column_name in ('full_name', 'phone_primary', 'telegram_id')) = 3);

  ----------------------------------------------------------------------------
  -- The anonymous role reaches nothing (0011, 0012)
  ----------------------------------------------------------------------------
  perform pg_temp.notok('anon cannot read users',      has_table_privilege('anon', 'public.users', 'SELECT'));
  perform pg_temp.notok('anon cannot read the directory', has_table_privilege('anon', 'public.user_directory', 'SELECT'));
  perform pg_temp.notok('anon cannot read modules',    has_table_privilege('anon', 'public.modules', 'SELECT'));
  perform pg_temp.notok('anon cannot call my_views',   has_function_privilege('anon', 'public.my_views()', 'EXECUTE'));
  perform pg_temp.notok('anon cannot call can_delete_user',
    has_function_privilege('anon', 'public.can_delete_user(uuid)', 'EXECUTE'));
  perform pg_temp.ok('authenticated can call can_delete_user',
    has_function_privilege('authenticated', 'public.can_delete_user(uuid)', 'EXECUTE'));
  perform pg_temp.ok('authenticated can read users',   has_table_privilege('authenticated', 'public.users', 'SELECT'));
  perform pg_temp.ok('authenticated can call my_views',has_function_privilege('authenticated', 'public.my_views()', 'EXECUTE'));

  -- Trigger functions are not API surface (0013, 0023).
  perform pg_temp.notok('handle_new_auth_user is not callable',
    has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'EXECUTE'));
  perform pg_temp.notok('harvest_position is not callable',
    has_function_privilege('authenticated', 'public.harvest_position()', 'EXECUTE'));

  -- Stated as a property rather than a list, because the way this broke was a
  -- new trigger function inheriting a grant nobody wrote: 0012 revoked EXECUTE
  -- from PUBLIC, but the project's default privileges hand it to `authenticated`
  -- and `service_role` by name, which a revoke from PUBLIC does not touch. A
  -- per-function assertion would only ever cover the ones already known about.
  perform pg_temp.eq('no trigger function is reachable as an RPC',
    (select count(*)::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prorettype = 'trigger'::regtype
        and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE'))),
    '0');

  perform pg_temp.eq('every function in public pins its search_path',
    (select count(*)::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proconfig is null),
    '0');

  -- The six the frontend calls, and nothing else.
  perform pg_temp.eq('exactly the frontend RPCs are callable',
    (select string_agg(p.proname, ',' order by p.proname)
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
    'can_delete_user,can_edit_user,my_nav,my_permissions,my_views,set_default_printer');

  ----------------------------------------------------------------------------
  -- Every table carries row level security
  ----------------------------------------------------------------------------
  perform pg_temp.eq('every public table has RLS enabled',
    (select coalesce(string_agg(c.relname, ', '), '')
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), '');

  ----------------------------------------------------------------------------
  -- Constraints refuse what they should
  ----------------------------------------------------------------------------
  perform pg_temp.rejects('a suspension needs dates',
    format('update public.users set status = ''suspended'', suspended_from = null,
            suspended_to = null where id = %L', v_mgr));
  perform pg_temp.rejects('a suspension cannot end before it starts',
    format('update public.users set status = ''suspended'', suspended_from = current_date,
            suspended_to = current_date - 1 where id = %L', v_mgr));
  perform pg_temp.rejects('a discharge needs a date',
    format('update public.users set status = ''discharged'', discharged_date = null
            where id = %L', v_mgr));
  perform pg_temp.rejects('nobody manages themselves',
    format('update public.users set manager_id = %L where id = %L', v_mgr, v_mgr));
  perform pg_temp.rejects('an override always needs a scope',
    format('insert into public.user_permission_overrides (user_id, module_key, action, scope)
            values (%L, ''invoice'', ''view'', null)', v_jr));
  perform pg_temp.rejects('a permission needs a real module',
    format('insert into public.user_permission_overrides (user_id, module_key, action, scope)
            values (%L, ''not_a_module'', ''view'', ''own'')', v_jr));
  perform pg_temp.rejects('a view assignment needs a real view',
    format('insert into public.user_views (user_id, view_key, effect)
            values (%L, ''not_a_view'', ''allow'')', v_jr));

  -- Two departments may not share a name.
  if v_dep is not null then
    perform pg_temp.rejects('two departments may not share a name',
      'insert into public.departments (name) values (''HIGTest Marketing'')');
  end if;

  -- Printers (0018). The address CHECK is deliberately loose — it catches the
  -- paste that dropped half the address, not every RFC violation.
  perform pg_temp.rejects('a printer address needs an @ and a dotted host',
    'insert into public.printers (label, eprint_address) values (''Bad'', ''not-an-address'')');
  perform pg_temp.rejects('a printer needs a label that is not just spaces',
    'insert into public.printers (label, eprint_address) values (''  '', ''blank@print.example.com'')');

  ----------------------------------------------------------------------------
  -- Row visibility under RLS
  --
  -- These need `set local role authenticated`, which not every connection is
  -- allowed to do. Rather than fail on a restricted one, the block reports
  -- whether it ran or skipped in the final message.
  ----------------------------------------------------------------------------
  begin
    execute 'set local role authenticated';

    perform pg_temp.act_as(v_rep);
    -- The rep holds user.view at 'own' from the override above, so the policy
    -- `id = auth.uid() or app.can('user','view', id)` should resolve to one row.
    perform pg_temp.eq('RLS: own scope shows only your own row',
      (select count(*)::text from public.users), '1');
    perform pg_temp.eq('RLS: and it is the right row',
      (select id::text from public.users), v_rep::text);

    perform pg_temp.act_as(v_sa);
    perform pg_temp.ok('RLS: a super admin sees the fixtures',
      (select count(*) from public.users) >= 7);

    perform pg_temp.act_as(v_sus);
    perform pg_temp.eq('RLS: a suspended super admin sees only themselves',
      (select count(*)::text from public.users), '1');

    -- Creating a role is what the New role button does. The policy on
    -- public.roles is `app.can('role_permission','edit')`, so the button being
    -- hidden is a courtesy and this is the part that actually holds.
    perform pg_temp.act_as(v_sa);
    insert into public.roles (key, name, description, sort_order)
      values ('higtest_new_role', 'HIGTest New Role', 'created under RLS', 99);
    perform pg_temp.eq('RLS: role_permission.edit may create a role',
      (select count(*)::text from public.roles where key = 'higtest_new_role'), '1');
    perform pg_temp.eq('RLS: a new role starts with no permissions at all',
      (select count(*)::text from public.role_permissions rp
        join public.roles r on r.id = rp.role_id
       where r.key = 'higtest_new_role'), '0');

    perform pg_temp.act_as(v_rep);
    perform pg_temp.refused('RLS: a sales rep may not create a role',
      'insert into public.roles (key, name, sort_order)
         values (''higtest_rep_role'', ''HIGTest Rep Role'', 98)');
    perform pg_temp.eq('RLS: and the refused role was not created',
      (select count(*)::text from public.roles where key = 'higtest_rep_role'), '0');

    -- Adding an employee, which is what the Add new user form does. Since 0016
    -- this needs no auth account, so it is an ordinary insert under the
    -- `app.can('user','add')` policy rather than a privileged operation.
    perform pg_temp.act_as(v_sa);
    insert into public.users (full_name, nickname, telegram_id, department_id, position, role_id)
    select 'HIGTest NoLogin', 'Noli', '@noli', d.id, 'Driver', r.id
      from public.departments d, public.roles r
     where d.name = 'Warehouse & Logistic' and r.key = 'warehouse'
    returning id into v_nol;
    perform pg_temp.eq('RLS: user.add creates an employee with no login',
      (select count(*)::text from public.users where id = v_nol), '1');

    perform pg_temp.act_as(v_rep);
    perform pg_temp.refused('RLS: a sales rep may not add an employee',
      'insert into public.users (full_name) values (''HIGTest Sneaky'')');
    perform pg_temp.eq('RLS: and the refused employee was not created',
      (select count(*)::text from public.users where full_name = 'HIGTest Sneaky'), '0');

    ------------------------------------------------------------------------
    -- Printers (0018), and the shape of a refusal
    ------------------------------------------------------------------------
    perform pg_temp.act_as(v_sa);
    insert into public.printers (label, eprint_address, sort_order)
      values ('HIGTest Counter', 'higtest-counter@print.example.com', 1)
      returning id into v_prn;
    insert into public.printers (label, eprint_address, sort_order)
      values ('HIGTest Depot', 'higtest-depot@print.example.com', 2);
    perform pg_temp.eq('RLS: settings.edit may add a printer',
      (select count(*)::text from public.printers where label like 'HIGTest%'), '2');
    perform pg_temp.eq('a new printer does not make itself the default',
      (select count(*)::text from public.printers where label like 'HIGTest%' and is_default), '0');

    perform public.set_default_printer(v_prn);
    perform pg_temp.eq('promoting sets the default',
      (select is_default::text from public.printers where id = v_prn), 'true');
    perform public.set_default_printer(
      (select id from public.printers where eprint_address = 'higtest-depot@print.example.com'));
    perform pg_temp.eq('promoting another clears the first',
      (select is_default::text from public.printers where id = v_prn), 'false');
    perform pg_temp.eq('and only one is ever the default',
      (select count(*)::text from public.printers where is_default), '1');

    perform pg_temp.act_as(v_rep);
    perform pg_temp.eq('anyone signed in may read printers, since anyone may print',
      (select count(*)::text from public.printers where label like 'HIGTest%'), '2');
    perform pg_temp.refused('RLS: a sales rep may not add a printer',
      'insert into public.printers (label, eprint_address)
         values (''HIGTest Sneaky'', ''sneaky@print.example.com'')');

    -- The distinction the settings screen depends on. INSERT is rejected by
    -- WITH CHECK and raises; UPDATE and DELETE are filtered by USING, match no
    -- rows, and raise nothing at all. A client that only checks for an error
    -- would report a refused edit as a successful one, which is why both write
    -- paths ask for the affected rows back.
    update public.printers set label = 'Hijacked' where id = v_prn;
    get diagnostics v_hit = row_count;
    perform pg_temp.eq('a refused update touches no rows and raises nothing', v_hit::text, '0');
    perform pg_temp.eq('and the label is untouched',
      (select label from public.printers where id = v_prn), 'HIGTest Counter');

    delete from public.printers where id = v_prn;
    get diagnostics v_hit = row_count;
    perform pg_temp.eq('a refused delete touches no rows', v_hit::text, '0');

    -- set_default_printer turns that silence back into an error, because a
    -- promotion that quietly did nothing is worse than one that says why not.
    perform pg_temp.refused('promoting a default says so rather than failing quietly',
      format('select public.set_default_printer(%L)', v_prn));

    ------------------------------------------------------------------------
    -- Suspending and discharging (0019)
    --
    -- The stamp is the database's job, not the client's: who did it and when
    -- should not depend on a form remembering to send them.
    ------------------------------------------------------------------------
    perform pg_temp.act_as(v_sa);
    update public.users
       set status = 'suspended', suspended_from = current_date,
           suspended_to = current_date + 30, status_note = 'Pending review'
     where id = v_wh;
    perform pg_temp.eq('suspending records who did it',
      (select status_changed_by::text from public.users where id = v_wh), v_sa::text);
    perform pg_temp.ok('and stamps when',
      (select status_changed_at is not null from public.users where id = v_wh));

    -- Coming back to active leaves nothing behind to misread.
    update public.users set status = 'active' where id = v_wh;
    perform pg_temp.eq('reinstating clears the suspension dates',
      (select coalesce(suspended_from::text, '') || coalesce(suspended_to::text, '')
         from public.users where id = v_wh), '');

    update public.users set status = 'discharged', discharged_date = current_date where id = v_wh;
    update public.users set status = 'active' where id = v_wh;
    perform pg_temp.eq('and the discharge date with it',
      (select discharged_date::text from public.users where id = v_wh), null);

    -- Editing anything else must leave the stamp alone.
    update public.users set status_changed_by = null, status_changed_at = null where id = v_wh;
    update public.users set nickname = 'Ratana' where id = v_wh;
    perform pg_temp.eq('an ordinary edit does not restamp the status',
      (select status_changed_by::text from public.users where id = v_wh), null);

    ------------------------------------------------------------------------
    -- Departments are organisation configuration, so they follow the same
    -- permission as roles rather than the one for editing a person.
    ------------------------------------------------------------------------
    insert into public.departments (name, sort_order) values ('HIGTest Marketing', 90)
      returning id into v_dep;
    perform pg_temp.eq('role_permission.edit may create a department',
      (select count(*)::text from public.departments where name = 'HIGTest Marketing'), '1');

    perform pg_temp.act_as(v_rep);
    perform pg_temp.eq('anyone signed in may read departments',
      (select count(*)::text from public.departments where name = 'HIGTest Marketing'), '1');
    perform pg_temp.refused('RLS: a sales rep may not create a department',
      'insert into public.departments (name) values (''HIGTest Sneaky'')');

    update public.departments set name = 'Hijacked' where id = v_dep;
    get diagnostics v_hit = row_count;
    perform pg_temp.eq('a refused department rename touches no rows', v_hit::text, '0');

    ------------------------------------------------------------------------
    -- Removing an employee record (0020)
    --
    -- can_delete_user answers the scoped question the policy will ask about
    -- one particular person, which my_permissions cannot.
    ------------------------------------------------------------------------
    perform pg_temp.act_as(v_sa);
    insert into public.users (full_name, email)
      values ('HIGTest Victim', 'fx.vic@example.test') returning id into v_vic;
    insert into public.user_permission_overrides (user_id, module_key, action, scope)
      values (v_vic, 'customer', 'view', 'own');
    insert into public.user_views (user_id, view_key, effect)
      values (v_vic, 'sales', 'allow');
    perform pg_temp.ok('a super admin may delete a record',
      public.can_delete_user(v_vic));

    perform pg_temp.act_as(v_rep);
    perform pg_temp.notok('a sales rep may not', public.can_delete_user(v_vic));
    delete from public.users where id = v_vic;
    get diagnostics v_hit = row_count;
    perform pg_temp.eq('and their delete touches no rows', v_hit::text, '0');
    perform pg_temp.eq('leaving the record in place',
      (select count(*)::text from public.users where id = v_vic), '1');

    perform pg_temp.act_as(v_sa);
    delete from public.users where id = v_vic;
    get diagnostics v_hit = row_count;
    perform pg_temp.eq('a permitted delete removes exactly one row', v_hit::text, '1');
    -- What the Remove sheet warns about, actually happening.
    perform pg_temp.eq('and takes the permission overrides with it',
      (select count(*)::text from public.user_permission_overrides where user_id = v_vic), '0');
    perform pg_temp.eq('and the view assignments',
      (select count(*)::text from public.user_views where user_id = v_vic), '0');

    ------------------------------------------------------------------------
    -- Editing your own record (0021)
    --
    -- The update policy admits `id = auth.uid()`, so before this guard every
    -- employee could set their own role_id — or is_super_admin — over the API
    -- and hand themselves the company. Row level security chooses rows, not
    -- columns, so the split is enforced by a trigger.
    ------------------------------------------------------------------------
    perform pg_temp.act_as(v_rep);
    update public.users
       set nickname = 'Ratana', phone_secondary = '098 765 432', photo_path = 'x/new.jpg'
     where id = v_rep;
    perform pg_temp.eq('a nickname is yours to change',
      (select nickname from public.users where id = v_rep), 'Ratana');
    perform pg_temp.eq('so is a second number and a photo',
      (select phone_secondary || '|' || photo_path from public.users where id = v_rep),
      '098 765 432|x/new.jpg');

    -- A no-op is not a change, so an idempotent save is not refused.
    update public.users set full_name = 'Fixture Rep' where id = v_rep;

    perform pg_temp.refused('you may not give yourself another role',
      format('update public.users set role_id = (select id from public.roles where key = ''system_admin'')
                where id = %L', v_rep));
    perform pg_temp.refused('nor make yourself a super admin',
      format('update public.users set is_super_admin = true where id = %L', v_rep));
    perform pg_temp.refused('nor rename yourself',
      format('update public.users set full_name = ''Someone Else'' where id = %L', v_rep));
    perform pg_temp.refused('nor change your own bank account',
      format('update public.users set bank_account_number = ''999'' where id = %L', v_rep));
    perform pg_temp.refused('nor change your own employment status',
      format('update public.users set status = ''discharged'', discharged_date = current_date
                where id = %L', v_rep));
    perform pg_temp.eq('and the record is exactly as it was',
      (select full_name || '|' || is_super_admin::text from public.users where id = v_rep),
      'Fixture Rep|false');

    -- Holding the user module lifts the guard, on your own row as on anyone's.
    perform pg_temp.act_as(v_sa);
    update public.users set full_name = 'Fixture Admin Two' where id = v_sa;
    perform pg_temp.eq('an administrator may still correct their own record',
      (select full_name from public.users where id = v_sa), 'Fixture Admin Two');

    execute 'reset role';
    v_rls := 'ran';
  exception when insufficient_privilege then
    execute 'reset role';
    v_rls := 'skipped (cannot assume the authenticated role)';
  end;

  ----------------------------------------------------------------------------
  -- Granting a login to an employee who already has a record (0016)
  --
  -- These read auth.users, which `authenticated` cannot, so they sit outside the
  -- block above. v_nol is null when that block skipped, and the section skips
  -- with it rather than reporting a pass it never made.
  ----------------------------------------------------------------------------
  if v_nol is not null then
    perform pg_temp.rejects('two employees may not share an email',
      format('update public.users set email = ''fx.rep@example.test'' where id = %L', v_nol));

    update public.users set email = 'fx.nologin@example.test' where id = v_nol;
    update public.users set manager_id = v_nol where id = v_rep;

    -- Signing them up now: the trigger should adopt the waiting record.
    perform pg_temp.new_user(v_new, 'fx.nologin@example.test', 'Should Be Ignored', 'sales');

    perform pg_temp.eq('a later login adopts the waiting record, not a second one',
      (select count(*)::text from public.users where email = 'fx.nologin@example.test'), '1');
    perform pg_temp.eq('the record moved onto the auth id',
      (select id::text from public.users where email = 'fx.nologin@example.test'), v_new::text);
    perform pg_temp.eq('and kept the name the admin typed, not the signup metadata',
      (select full_name from public.users where id = v_new), 'HIGTest NoLogin');
    perform pg_temp.eq('and kept its department',
      (select d.name from public.users u join public.departments d on d.id = u.department_id
        where u.id = v_new), 'Warehouse & Logistic');
    perform pg_temp.eq('reports follow the re-key',
      (select manager_id::text from public.users where id = v_rep), v_new::text);
  end if;

  -- Two printers may not claim the same address, or the same defaultness.
  if v_prn is not null then
    perform pg_temp.rejects('two printers may not share an address',
      'insert into public.printers (label, eprint_address)
         values (''Dupe'', ''HIGTEST-DEPOT@print.example.com'')');
    perform pg_temp.rejects('only one printer may be the default',
      format('update public.printers set is_default = true where id = %L', v_prn));
  end if;

  ----------------------------------------------------------------------------
  -- Everything passed. Raise, so the whole transaction unwinds and the fixtures
  -- never existed.
  ----------------------------------------------------------------------------
  raise exception 'ACCESS MODEL OK - % assertions passed (rls: %)',
    current_setting('higtest.checks'), v_rls;
end;
$$;
