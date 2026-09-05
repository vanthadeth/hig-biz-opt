-- 0036_data_sync
--
-- One-way sync: a Google Sheet tab in, a Supabase table out. Never the other
-- direction.
--
-- The reason it exists is a transition, not an integration. HIG's real database
-- is a spreadsheet that people update every day, and this app is not ready to
-- replace it. So the sheet stays authoritative for now and the app follows it,
-- until the day the app is ready and this can be switched off.
--
-- Three things decide the shape of this.
--
-- 1. The sheet is never written to
--
-- Not "we choose not to write" — we hold a credential that cannot. The service
-- account is granted spreadsheets.readonly and each sheet is shared with it as
-- a Viewer. There is no code path here that could write to a sheet even if
-- somebody added one, because the token would be refused. That is the whole
-- protection, and it is worth more than any amount of care in the application.
--
-- 2. A sync may not name any table it likes
--
-- The obvious design is a text box for the target table. The obvious design
-- lets somebody define a sync into public.users mapping a sheet column onto
-- is_super_admin, and hand themselves the company. So targets are a seeded
-- registry, columns are checked against an allow-list, and both checks live in
-- the database rather than in the screen that happens to be in front of you.
--
-- 3. The write is one function, not composed SQL in the application
--
-- app.sync_apply is the only thing that writes to a target table. It is
-- security definer, it re-validates the target and every column against the
-- registry, and it quotes every identifier. The Node process that fetches from
-- Google hands it rows and can do nothing else. If that process is ever
-- compromised, the blast radius is the tables in the registry and the columns
-- the registry allows.

-- A key to sync customers on ------------------------------------------------------
-- A one-way sync needs a stable identifier: without one, the second run cannot
-- tell an edited shop from a new one, and the customer book fills with
-- duplicates. Items and brands already have one; customers did not.
alter table public.customers add column code text;

alter table public.customers
  add constraint customers_code_ck check (code is null or btrim(code) <> '');

create unique index customers_code_unique
  on public.customers (lower(code)) where code is not null;

-- What a sync may write to ---------------------------------------------------------
create table public.sync_targets (
  table_name       text primary key,
  label            text not null,

  -- The column a row is matched on, and the ON CONFLICT clause that finds it.
  -- Held apart because the index is often on an expression: items are unique on
  -- lower(code), not on code, and inferring the wrong one silently turns every
  -- update into an insert.
  key_column       text not null,
  conflict_target  text not null,

  -- Columns a mapping may never point at, on top of the ones no sync should
  -- ever touch. Identity, timestamps and ownership are the app's to set.
  blocked_columns  text[] not null default array[
    'id', 'created_at', 'updated_at', 'created_by', 'owner_id'
  ],

  sort_order       integer not null default 0,

  constraint sync_targets_label_ck check (btrim(label) <> '')
);

insert into public.sync_targets (table_name, label, key_column, conflict_target, sort_order) values
  ('items',     'Items',     'code', '(lower(code)) where code is not null', 1),
  ('brands',    'Brands',    'name', '(lower(name))',                       2),
  ('customers', 'Customers', 'code', '(lower(code)) where code is not null', 3);

-- Ownership is the app's to decide, not a sheet's.
update public.sync_targets
   set blocked_columns = blocked_columns || array['status_changed_by', 'status_changed_at']
 where table_name = 'customers';

-- The columns a target actually offers ----------------------------------------------
-- Read from the catalogue rather than listed by hand, so a column added by a
-- later migration is offerable without editing a list somebody will forget.
-- Generated and identity columns are excluded: writing to one is an error, not
-- a choice.
create function app.sync_columns(p_table text)
returns table (column_name text, data_type text, is_required boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.column_name::text,
    c.data_type::text,
    (c.is_nullable = 'NO' and c.column_default is null) as is_required
  from information_schema.columns c
  join public.sync_targets t on t.table_name = c.table_name
  where c.table_schema = 'public'
    and c.table_name = p_table
    and c.is_generated = 'NEVER'
    and c.is_identity  = 'NO'
    and not (c.column_name = any (t.blocked_columns))
  order by c.ordinal_position;
$$;

revoke all on function app.sync_columns(text) from public, authenticated, anon, service_role;

-- Definer, like every other wrapper here: `authenticated` holds no EXECUTE on
-- the app-schema function, so an invoker wrapper would fail for exactly the
-- people it is for. The permission check is the gate.
create function public.sync_columns(p_table text)
returns table (column_name text, data_type text, is_required boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.column_name, c.data_type, c.is_required
  from app.sync_columns(p_table) c
  where app.can('data_sync', 'view');
$$;

grant execute on function public.sync_columns(text) to authenticated;

-- A sync -----------------------------------------------------------------------------
create type public.sync_trigger  as enum ('change', 'interval');
create type public.sync_status   as enum ('running', 'ok', 'failed');
create type public.sync_source   as enum ('manual', 'schedule', 'change');
create type public.sync_value    as enum ('text', 'number', 'integer', 'boolean', 'date', 'timestamp');

create table public.sync_definitions (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,

  -- The id out of the sheet's URL, not the URL: the URL carries a tab fragment
  -- and a share token that both go stale, and neither identifies the file.
  spreadsheet_id  text not null,
  tab_name        text not null,
  -- Which row holds the column headings. Almost always 1, but a sheet people
  -- have lived in for years often has a title row above it.
  header_row      integer not null default 1,

  target_table    text not null references public.sync_targets (table_name),

  trigger_kind    public.sync_trigger not null default 'interval',
  -- Minutes, whatever unit the screen offered. "Every 2 hours" and "every 120
  -- minutes" are the same schedule, and storing both units would let them
  -- disagree.
  interval_minutes integer,

  -- What the sheet's Apps Script presents to say "something changed". Random,
  -- per sync, and rotatable: it is a bearer credential on an endpoint that
  -- starts work.
  hook_token      text not null default encode(gen_random_bytes(24), 'hex'),

  active          boolean not null default true,
  last_run_at     timestamptz,
  next_run_at     timestamptz,

  created_by      uuid references public.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint sync_definitions_name_ck check (btrim(name) <> ''),
  constraint sync_definitions_spreadsheet_ck check (btrim(spreadsheet_id) <> ''),
  constraint sync_definitions_tab_ck check (btrim(tab_name) <> ''),
  constraint sync_definitions_header_row_ck check (header_row >= 1),
  -- An interval sync with no interval would never be due, and would sit in the
  -- list looking as though it were working.
  constraint sync_definitions_interval_ck check (
    trigger_kind <> 'interval' or (interval_minutes is not null and interval_minutes >= 1)
  )
);

create unique index sync_definitions_hook_token_unique
  on public.sync_definitions (hook_token);
create index on public.sync_definitions (next_run_at) where active;

create trigger sync_definitions_set_updated_at
  before update on public.sync_definitions
  for each row execute function public.set_updated_at();

-- Which sheet column feeds which table column ----------------------------------------
-- A row per sheet column, including the ones nobody wants: `target_column` null
-- is how "skip this one" is recorded. Storing the skips as well as the picks is
-- what lets the screen show a sheet's columns without re-reading the sheet, and
-- what makes a newly-appeared column visibly unmapped rather than silently so.
create table public.sync_column_maps (
  id            uuid primary key default gen_random_uuid(),
  sync_id       uuid not null references public.sync_definitions (id) on delete cascade,
  sheet_column  text not null,
  target_column text,
  value_kind    public.sync_value not null default 'text',
  sort_order    integer not null default 0,

  constraint sync_column_maps_sheet_column_ck check (btrim(sheet_column) <> '')
);

create unique index sync_column_maps_one_per_sheet_column
  on public.sync_column_maps (sync_id, sheet_column);
-- Two sheet columns feeding one table column is not a mapping, it is a race
-- between them.
create unique index sync_column_maps_one_per_target_column
  on public.sync_column_maps (sync_id, target_column) where target_column is not null;

-- The allow-list, enforced where it cannot be skipped ---------------------------------
create function public.guard_sync_column()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table text;
begin
  if new.target_column is null then
    return new;
  end if;

  select target_table into v_table
    from public.sync_definitions where id = new.sync_id;

  if not exists (
    select 1 from app.sync_columns(v_table) c where c.column_name = new.target_column
  ) then
    raise exception
      'sync: % is not a column this sync may write to on %', new.target_column, v_table
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger sync_column_maps_guard
  before insert or update on public.sync_column_maps
  for each row execute function public.guard_sync_column();

-- What happened, and when ---------------------------------------------------------
create table public.sync_runs (
  id           uuid primary key default gen_random_uuid(),
  sync_id      uuid not null references public.sync_definitions (id) on delete cascade,
  source       public.sync_source not null,
  status       public.sync_status not null default 'running',
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  rows_read    integer not null default 0,
  rows_written integer not null default 0,
  rows_skipped integer not null default 0,
  -- Why it failed, or what it decided to leave alone. Read by a person trying
  -- to work out why a shop did not appear.
  message      text,
  actor_id     uuid references public.users (id) on delete set null
);

create index on public.sync_runs (sync_id, started_at desc);

-- The only thing that writes to a target table ---------------------------------------
-- Definer, because a scheduled run has no session to borrow permissions from,
-- and because the checks below are the permission: the target must be in the
-- registry and every column must be one the registry allows. Identifiers are
-- quoted; the conflict target comes from the registry, which only a migration
-- writes.
create function app.sync_apply(p_sync uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table    text;
  v_conflict text;
  v_columns  text[];
  v_cols     text;
  v_updates  text;
  v_written  integer;
begin
  select d.target_table, t.conflict_target
    into v_table, v_conflict
    from public.sync_definitions d
    join public.sync_targets t on t.table_name = d.target_table
   where d.id = p_sync and d.active;

  if v_table is null then
    raise exception 'sync: no active sync %', p_sync using errcode = 'no_data_found';
  end if;

  -- The mapped columns, re-checked against the allow-list rather than trusted
  -- because a row in sync_column_maps once passed the guard. A column can be
  -- dropped or blocked after a mapping was saved.
  select array_agg(m.target_column order by m.sort_order)
    into v_columns
    from public.sync_column_maps m
   where m.sync_id = p_sync
     and m.target_column is not null
     and exists (
       select 1 from app.sync_columns(v_table) c where c.column_name = m.target_column
     );

  if v_columns is null or array_length(v_columns, 1) = 0 then
    raise exception 'sync: nothing is mapped' using errcode = 'check_violation';
  end if;

  select string_agg(quote_ident(c), ', ') into v_cols from unnest(v_columns) c;
  select string_agg(format('%I = excluded.%I', c, c), ', ') into v_updates
    from unnest(v_columns) c;

  -- jsonb_populate_recordset casts each object to the table's own row type, so
  -- the column types do the coercion rather than a hand-written cast per type.
  -- Keys that are not columns are ignored by it, and there are none: the rows
  -- were built from the mapping.
  execute format(
    'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) '
    || 'on conflict %s do update set %s',
    v_table, v_cols, v_cols, v_table, v_conflict, v_updates
  ) using p_rows;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke all on function app.sync_apply(uuid, jsonb) from public, authenticated, anon;
-- Only the server process that fetches from Google calls this, and it holds the
-- service role. No signed-in person reaches it.
grant execute on function app.sync_apply(uuid, jsonb) to service_role;

-- Row level security -----------------------------------------------------------------
alter table public.sync_targets      enable row level security;
alter table public.sync_definitions  enable row level security;
alter table public.sync_column_maps  enable row level security;
alter table public.sync_runs         enable row level security;

create policy sync_targets_select on public.sync_targets
  for select to authenticated using (app.can('data_sync', 'view'));

create policy sync_definitions_select on public.sync_definitions
  for select to authenticated using (app.can('data_sync', 'view'));
create policy sync_definitions_insert on public.sync_definitions
  for insert to authenticated with check (app.can('data_sync', 'add'));
create policy sync_definitions_update on public.sync_definitions
  for update to authenticated
  using (app.can('data_sync', 'edit')) with check (app.can('data_sync', 'edit'));
create policy sync_definitions_delete on public.sync_definitions
  for delete to authenticated using (app.can('data_sync', 'delete'));

create policy sync_column_maps_select on public.sync_column_maps
  for select to authenticated using (app.can('data_sync', 'view'));
create policy sync_column_maps_insert on public.sync_column_maps
  for insert to authenticated with check (app.can('data_sync', 'edit'));
create policy sync_column_maps_update on public.sync_column_maps
  for update to authenticated
  using (app.can('data_sync', 'edit')) with check (app.can('data_sync', 'edit'));
create policy sync_column_maps_delete on public.sync_column_maps
  for delete to authenticated using (app.can('data_sync', 'edit'));

-- A run is a record of what happened. Nobody edits history from the app; the
-- server process writes it with the service role, which policies do not gate.
create policy sync_runs_select on public.sync_runs
  for select to authenticated using (app.can('data_sync', 'view'));

-- Supabase grants `authenticated` every verb on a new table in public, so the
-- revoke is what makes these grants mean anything.
revoke all on public.sync_targets     from authenticated;
revoke all on public.sync_definitions from authenticated;
revoke all on public.sync_column_maps from authenticated;
revoke all on public.sync_runs        from authenticated;

grant select on public.sync_targets to authenticated;
grant select, insert, update, delete on public.sync_definitions to authenticated;
grant select, insert, update, delete on public.sync_column_maps to authenticated;
grant select on public.sync_runs to authenticated;

-- The module -------------------------------------------------------------------------
insert into public.modules (key, name, icon, href, sort_order, group_name) values
  ('data_sync', 'Data Sync', 'refresh', 'data-sync', 12, 'System');

insert into public.view_modules (view_key, module_key, sort_order) values
  ('admin', 'data_sync', 5);

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'data_sync', a.action::public.permission_action, 'any'::public.permission_scope
from public.roles r
cross join (values ('view'), ('add'), ('edit'), ('delete')) as a(action)
where r.key = 'system_admin';

comment on table public.sync_definitions is
  'One-way: a Google Sheet tab in, a Supabase table out. The credential held '
  'for Google is read-only, so nothing here can write to a sheet.';
