-- 0006_rls
-- Row level security on every table. No permissive development policies: the
-- same rules that gate the UI gate the database.

alter table public.departments              enable row level security;
alter table public.positions                enable row level security;
alter table public.roles                    enable row level security;
alter table public.modules                  enable row level security;
alter table public.role_permissions         enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.views                    enable row level security;
alter table public.view_modules             enable row level security;
alter table public.role_views               enable row level security;
alter table public.user_views               enable row level security;
alter table public.users                    enable row level security;

-- Reference data the shell needs before it can draw anything -------------------
-- Readable by any signed-in user; writable only with the role_permission module.
do $$
declare
  t text;
begin
  foreach t in array array[
    'departments', 'positions', 'roles', 'modules',
    'views', 'view_modules', 'role_views', 'role_permissions'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (app.can(''role_permission'', ''edit'')) '
      || 'with check (app.can(''role_permission'', ''edit''))',
      t || '_write', t
    );
  end loop;
end;
$$;

-- Users -----------------------------------------------------------------------
-- Always your own row, plus whatever the `user` module grants at your scope.
create policy users_select on public.users
  for select to authenticated
  using (id = auth.uid() or app.can('user', 'view', id));

create policy users_insert on public.users
  for insert to authenticated
  with check (app.can('user', 'add'));

create policy users_update on public.users
  for update to authenticated
  using (id = auth.uid() or app.can('user', 'edit', id))
  with check (id = auth.uid() or app.can('user', 'edit', id));

create policy users_delete on public.users
  for delete to authenticated
  using (app.can('user', 'delete', id));

-- Per-user overrides ----------------------------------------------------------
-- Readable for yourself so the client can explain its own access; writable only
-- by someone who may edit users.
create policy user_permission_overrides_select on public.user_permission_overrides
  for select to authenticated
  using (user_id = auth.uid() or app.can('user', 'view', user_id));

create policy user_permission_overrides_write on public.user_permission_overrides
  for all to authenticated
  using (app.can('user', 'edit', user_id))
  with check (app.can('user', 'edit', user_id));

create policy user_views_select on public.user_views
  for select to authenticated
  using (user_id = auth.uid() or app.can('user', 'view', user_id));

create policy user_views_write on public.user_views
  for all to authenticated
  using (app.can('user', 'edit', user_id))
  with check (app.can('user', 'edit', user_id));

-- Directory view --------------------------------------------------------------
-- Date of birth is marked "not shown in public" and bank details are payroll
-- data, so neither belongs in the list every colleague can read. Consumers that
-- legitimately need them read public.users directly, where RLS still applies.
create view public.user_directory
with (security_invoker = true)
as
select
  u.id,
  u.full_name,
  u.nickname,
  u.gender,
  u.photo_path,
  u.phone_primary,
  u.phone_secondary,
  u.telegram_id,
  u.email,
  u.department_id,
  u.position,
  u.manager_id,
  u.employment_date,
  u.role_id,
  u.status,
  u.suspended_from,
  u.suspended_to,
  u.discharged_date
from public.users u;

grant select on public.user_directory to authenticated;
