-- 0010_grants
-- Supabase's default ACLs already grant these to `authenticated`, but relying on
-- a default that depends on which role ran the migration is fragile. Stating them
-- makes the intent explicit and keeps the schema reproducible elsewhere.
--
-- Row level security is what decides which rows a signed-in user actually sees;
-- these privileges only let the query reach the policies.

grant select on
  public.departments,
  public.positions,
  public.roles,
  public.modules,
  public.views,
  public.view_modules,
  public.role_views,
  public.role_permissions
to authenticated;

-- Configuration tables are writable only with role_permission.edit, which the
-- policies in 0006 enforce; the grant just lets the attempt reach them.
grant insert, update, delete on
  public.departments,
  public.positions,
  public.roles,
  public.modules,
  public.views,
  public.view_modules,
  public.role_views,
  public.role_permissions
to authenticated;

grant select, insert, update, delete on
  public.users,
  public.user_permission_overrides,
  public.user_views
to authenticated;

grant select on public.user_directory to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
