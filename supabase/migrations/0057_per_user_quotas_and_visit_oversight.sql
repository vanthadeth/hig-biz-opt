-- 0057_per_user_quotas_and_visit_oversight
--
-- Two things a manager could not do until now.
--
-- SET ONE REP'S TARGET DIFFERENTLY FROM THE REST. The quota on app_settings is
-- one row for the whole company — every rep measured against the same eight
-- calls a day, whatever their patch looks like. A rep covering three
-- provinces and a rep covering one district are not the same job, and a
-- manager who knows that had no way to say so. `user_visit_quotas` is the
-- override: one row per person, every field nullable, and a field left null
-- falls back to the company's own figure rather than to nothing — a business
-- that manages visit counts and sets one person's hours target and leaves the
-- rest alone should not have to fill in six boxes to change one.
--
-- Editing somebody else's target is its own permission, `visit_quota`,
-- deliberately apart from `visit` itself: seeing a colleague's calls and
-- deciding how many they should be making are different kinds of authority,
-- and the credit-limit precedent (0032) is the same shape — a supervisor who
-- may move a credit limit does not thereby gain the customer record itself.
-- Nobody holds it by default; system_admin holds it at 'any', a sales
-- supervisor or sales manager at 'sub' — their own line, walking the
-- manager_id chain the same way `sale_order` and `invoice` already do for
-- those two roles — and an ordinary rep holds none of it, not even for their
-- own account. A quota is set by somebody responsible for the number, not
-- typed in by the person it measures.
--
-- LOOK AT WHAT THE TEAM IS DOING. Until now `visit` had no 'sub' scope at
-- all — a sales supervisor could open the Visits page and see nothing, not
-- even their own department's open calls. This grants view at 'sub' to the
-- same two roles, matching the reach they already have into `sale_order` and
-- `invoice`. It is view only: watching a subordinate's day is not the same
-- permission as rewriting it, and `visit`'s own edit stays at 'own' for
-- everyone it is granted to. The screens built on top of this are what keep
-- watching from turning into acting — a manager's own check-in state must
-- never be computed from a list that now includes somebody else's, and a
-- subordinate's open visit must render as something to look at, not something
-- to close.

-- The override table --------------------------------------------------------------------
create table public.user_visit_quotas (
  user_id                uuid primary key references public.users(id) on delete cascade,
  daily_visit_target     integer,
  daily_working_hours    numeric(4, 2),
  daily_active_hours     numeric(4, 2),
  weekly_visit_target    integer,
  weekly_working_hours   numeric(5, 2),
  weekly_active_hours    numeric(5, 2),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references public.users(id) on delete set null,

  -- The same ranges app_settings holds its own six fields to, so a number
  -- refused at the company level cannot be typed in at the person level.
  constraint user_visit_quotas_daily_visits_ck
    check (daily_visit_target is null or daily_visit_target between 1 and 100),
  constraint user_visit_quotas_daily_working_ck
    check (daily_working_hours is null or daily_working_hours between 0.5 and 24),
  constraint user_visit_quotas_daily_active_ck
    check (daily_active_hours is null or daily_active_hours between 0.5 and 24),
  constraint user_visit_quotas_weekly_visits_ck
    check (weekly_visit_target is null or weekly_visit_target between 1 and 700),
  constraint user_visit_quotas_weekly_working_ck
    check (weekly_working_hours is null or weekly_working_hours between 0.5 and 168),
  constraint user_visit_quotas_weekly_active_ck
    check (weekly_active_hours is null or weekly_active_hours between 0.5 and 168),
  constraint user_visit_quotas_daily_active_le_working_ck check (
    daily_active_hours is null or daily_working_hours is null
    or daily_active_hours <= daily_working_hours
  ),
  constraint user_visit_quotas_weekly_active_le_working_ck check (
    weekly_active_hours is null or weekly_working_hours is null
    or weekly_active_hours <= weekly_working_hours
  )
);

comment on table public.user_visit_quotas is
  'One rep''s target, where it differs from the company''s. A null field is not '
  'zero: it means this person is measured by the company figure, same as '
  'before this table existed.';

create function public.stamp_visit_quota_editor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger user_visit_quotas_stamp_editor
  before insert or update on public.user_visit_quotas
  for each row execute function public.stamp_visit_quota_editor();

alter table public.user_visit_quotas enable row level security;

-- Reading your own target is how your own day gets a bar to draw against;
-- reading somebody else's is the same reach that would let you change it, so
-- there is nothing to see that the edit check would not already allow.
create policy user_visit_quotas_select on public.user_visit_quotas
  for select
  using (
    user_id = (select auth.uid())
    or app.can('visit_quota', 'edit', user_id)
  );

create policy user_visit_quotas_insert on public.user_visit_quotas
  for insert
  with check (app.can('visit_quota', 'edit', user_id));

create policy user_visit_quotas_update on public.user_visit_quotas
  for update
  using (app.can('visit_quota', 'edit', user_id))
  with check (app.can('visit_quota', 'edit', user_id));

-- No delete policy: a target is cleared by nulling its six fields, which
-- keeps the row's own history of who last touched it rather than erasing it.

grant select, insert, update on public.user_visit_quotas to authenticated;

-- The permission, and who holds it ------------------------------------------------------
insert into public.modules (key, name, icon, href, sort_order, group_name) values
  ('visit_quota', 'Visit Quota', 'chart', 'users', 13, 'Selling');

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'visit_quota', 'edit', v.scope
  from public.roles r
  join (values
    ('system_admin', 'any'::public.permission_scope),
    ('sales_supervisor', 'sub'::public.permission_scope),
    ('sales_manager', 'sub'::public.permission_scope)
  ) as v(role_key, scope) on v.role_key = r.key;

-- Seeing the team, not just yourself -----------------------------------------------------
insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'visit', 'view', 'sub'
  from public.roles r
 where r.key in ('sales_supervisor', 'sales_manager');

-- The screen's own question, asked of the database ---------------------------------------
create function public.can_edit_visit_quota(p_user uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app.can('visit_quota', 'edit', p_user);
$$;

grant execute on function public.can_edit_visit_quota(uuid) to authenticated;

-- As every RPC before it: PUBLIC gets execute by default, and anon inherits
-- it. Harmless here — no auth.uid() resolves to false — but the default is
-- still wrong.
revoke execute on function public.can_edit_visit_quota(uuid) from public;

notify pgrst, 'reload schema';
