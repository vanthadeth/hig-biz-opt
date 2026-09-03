-- 0030_audit_log
--
-- The Audit Log module has been in the registry since 0007 with a permission
-- nobody could use: `audit_log.view` granted to the system administrator, and
-- nothing behind it. This is what goes behind it.
--
-- What it records: every insert, update and delete on the tables people
-- actually change — the access model, the catalogue, the customer book — with
-- who did it, when, and which columns moved.
--
-- What it does not record:
--
--   * modules, views and view_modules. Those change when a migration runs, not
--     when somebody uses the app, so a row there would say "System" and mean
--     "we deployed".
--   * geo_provinces, geo_districts, geo_communes. Reference data, imported in
--     bulk; auditing it would bury a year of real entries under one import.
--   * auth.users. It is not ours to trigger on, and Supabase keeps its own
--     record of sign-ins.
--
-- Append-only by construction, not by convention: `authenticated` is granted
-- SELECT and nothing else, and there is no insert, update or delete policy for
-- anyone. The only thing that writes here is the trigger, which is security
-- definer and therefore runs as the table's owner. Somebody who can change a
-- price cannot quietly unchange the record of having changed it.

create type public.audit_action as enum ('insert', 'update', 'delete');

create table public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),

  -- Null when nothing was logged in: a migration, a service-role script, or
  -- the trigger that creates a public.users row as somebody signs up.
  actor_id    uuid references public.users (id) on delete set null,
  -- The name as it read at the time. A person can be renamed or removed, and
  -- an audit entry that changes its own account of who acted is not one.
  actor_name  text,

  table_name  text not null,
  -- The primary key as text, joined with " / " for the tables whose key is
  -- composite. Text rather than uuid because role_permissions is keyed on
  -- (role_id, module_key, action), and half the useful rows have no uuid at all.
  record_id   text,
  action      public.audit_action not null,
  -- Just the columns that moved, so a list can say what happened without
  -- opening the whole row.
  changed     text[] not null default '{}',
  old_row     jsonb,
  new_row     jsonb
);

-- The three questions asked of this table: what happened lately, what happened
-- to this record, and what has this person been doing.
create index audit_log_recent on public.audit_log (occurred_at desc);
create index audit_log_record on public.audit_log (table_name, record_id, occurred_at desc);
create index audit_log_actor  on public.audit_log (actor_id, occurred_at desc);

comment on table public.audit_log is
  'Append-only record of changes to the tables people edit. Nothing prunes it '
  'yet; when it grows past being useful, delete by occurred_at rather than '
  'adding a policy that lets the app do it.';

-- The recorder ------------------------------------------------------------------
create function public.record_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := auth.uid();
  v_name    text;
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_changed text[] := '{}';
  v_id      text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);

    -- created_at and updated_at are excluded deliberately. updated_at is moved
    -- by a trigger on every single update, so counting it would make the "did
    -- anything actually change" question below always answer yes.
    select coalesce(array_agg(e.key order by e.key), '{}')
      into v_changed
      from jsonb_each(v_new) e
     where e.key not in ('created_at', 'updated_at')
       and v_old -> e.key is distinct from e.value;

    -- A form that saves every field, including the ones nobody touched, still
    -- issues an UPDATE. That is not an event.
    if v_changed = '{}' then
      return null;
    end if;
  else
    v_old := to_jsonb(old);
  end if;

  v_row := coalesce(v_new, v_old);

  -- The primary key, whatever it is called and however many columns it spans.
  -- Ordered by column position, which is deterministic and, for every table
  -- here, the order the key was declared in.
  select string_agg(coalesce(v_row ->> a.attname, ''), ' / ' order by a.attnum)
    into v_id
    from pg_catalog.pg_index i
    join pg_catalog.pg_attribute a
      on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
   where i.indrelid = tg_relid and i.indisprimary;

  select u.full_name into v_name from public.users u where u.id = v_actor;

  insert into public.audit_log (
    actor_id, actor_name, table_name, record_id, action, changed, old_row, new_row
  ) values (
    v_actor, v_name, tg_table_name, v_id,
    lower(tg_op)::public.audit_action, v_changed, v_old, v_new
  );

  -- An AFTER trigger's return value is ignored; null says so plainly.
  return null;
end;
$$;

-- Callable only as a trigger. Supabase grants EXECUTE on new functions in
-- public to authenticated and service_role by name, and a definer function that
-- writes the audit log is not something to leave reachable as an RPC — 0023
-- made the same point about the other trigger functions.
revoke execute on function public.record_audit() from public, anon, authenticated, service_role;

-- Where it listens ---------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    -- The access model: who exists, what they may do, where they may go.
    'users', 'roles', 'role_permissions', 'role_views',
    'user_permission_overrides', 'user_views',
    'departments', 'positions',
    -- The catalogue.
    'item_categories', 'brands', 'items', 'item_variants', 'item_pictures',
    -- The customer book.
    'customers', 'customer_contacts', 'customer_pictures',
    -- Settings people edit.
    'printers'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      || 'for each row execute function public.record_audit()',
      t || '_audit', t
    );
  end loop;
end;
$$;

-- Who may read it ----------------------------------------------------------------
alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (app.can('audit_log', 'view'));

-- SELECT and nothing else, and the revoke is the half that does the work.
--
-- Supabase's default privileges hand `authenticated` every DML privilege on a
-- new table in `public`, so a bare `grant select` here would have added nothing
-- and left insert, update and delete standing. Row level security would still
-- have refused them — there is no policy for those commands — but that is one
-- mistaken `for all` policy away from not being true, and an audit log is
-- exactly the table not to leave resting on a single guard.
--
-- `service_role` keeps everything, as it does on every other table here. It
-- bypasses row level security anyway, so singling this table out would be
-- comfort rather than protection; what protects the log is that the app signs
-- in as a person and never holds that key.
revoke all on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;
