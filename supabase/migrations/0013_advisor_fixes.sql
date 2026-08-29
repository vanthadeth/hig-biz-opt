-- 0013_advisor_fixes
-- Everything the Supabase database linter flagged after 0012, other than the
-- unused-index notices (this database is new and empty, so nothing has used an
-- index yet) and leaked-password protection, which is a project auth setting
-- rather than schema.

-- 1. Pin the search_path on the one function that was missing it -------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Trigger functions are not API ------------------------------------------
-- These three are SECURITY DEFINER because they must write past RLS when a
-- trigger fires. Supabase's default ACL also exposes them at /rest/v1/rpc/,
-- where a signed-in user could call them directly. Triggers execute regardless
-- of the caller's privileges, so taking EXECUTE away costs nothing.
revoke execute on function public.set_updated_at()      from anon, authenticated, service_role, public;
revoke execute on function public.harvest_position()    from anon, authenticated, service_role, public;
revoke execute on function public.handle_new_auth_user() from anon, authenticated, service_role, public;

-- 3. Evaluate auth.uid() once per query, not once per row --------------------
-- Wrapping it in a scalar sub-select lets the planner hoist it into an InitPlan.
drop policy users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (id = (select auth.uid()) or app.can('user', 'view', id));

drop policy users_update on public.users;
create policy users_update on public.users
  for update to authenticated
  using (id = (select auth.uid()) or app.can('user', 'edit', id))
  with check (id = (select auth.uid()) or app.can('user', 'edit', id));

drop policy user_permission_overrides_select on public.user_permission_overrides;
create policy user_permission_overrides_select on public.user_permission_overrides
  for select to authenticated
  using (user_id = (select auth.uid()) or app.can('user', 'view', user_id));

drop policy user_views_select on public.user_views;
create policy user_views_select on public.user_views
  for select to authenticated
  using (user_id = (select auth.uid()) or app.can('user', 'view', user_id));

-- 4. One permissive SELECT policy per table ----------------------------------
-- The `_write` policies were written FOR ALL, which also matches SELECT, so
-- every read evaluated the permission check a second time for nothing. Split
-- them into the three commands they were actually meant to cover.
do $$
declare
  t text;
begin
  foreach t in array array[
    'departments', 'positions', 'roles', 'modules',
    'views', 'view_modules', 'role_views', 'role_permissions'
  ] loop
    execute format('drop policy %I on public.%I', t || '_write', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated '
      || 'with check (app.can(''role_permission'', ''add''))',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using (app.can(''role_permission'', ''edit'')) '
      || 'with check (app.can(''role_permission'', ''edit''))',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      || 'using (app.can(''role_permission'', ''delete''))',
      t || '_delete', t
    );
  end loop;
end;
$$;

drop policy user_permission_overrides_write on public.user_permission_overrides;
create policy user_permission_overrides_insert on public.user_permission_overrides
  for insert to authenticated with check (app.can('user', 'edit', user_id));
create policy user_permission_overrides_update on public.user_permission_overrides
  for update to authenticated
  using (app.can('user', 'edit', user_id))
  with check (app.can('user', 'edit', user_id));
create policy user_permission_overrides_delete on public.user_permission_overrides
  for delete to authenticated using (app.can('user', 'edit', user_id));

drop policy user_views_write on public.user_views;
create policy user_views_insert on public.user_views
  for insert to authenticated with check (app.can('user', 'edit', user_id));
create policy user_views_update on public.user_views
  for update to authenticated
  using (app.can('user', 'edit', user_id))
  with check (app.can('user', 'edit', user_id));
create policy user_views_delete on public.user_views
  for delete to authenticated using (app.can('user', 'edit', user_id));

-- 5. Cover the remaining foreign keys ----------------------------------------
create index on public.role_views (view_key);
create index on public.user_views (view_key);
create index on public.view_modules (module_key);
create index on public.users (status_changed_by);
