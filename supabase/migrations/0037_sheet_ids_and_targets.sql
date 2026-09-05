-- 0037_sheet_ids_and_targets
--
-- The sheets link to each other by an ID column, and until everything has moved
-- across those IDs are the only thing that says which item belongs to which
-- category. So they have to survive the crossing.
--
-- Three parts.
--
-- 1. Every syncable table remembers where it came from
--
-- `sheet_id` on each target, unique when present. It is the sheet's own
-- identifier, kept beside our uuid rather than instead of it: ours is what the
-- app uses and what survives the migration, theirs is what the sheets are
-- talking about in the meantime. When the sheet is finally switched off, these
-- columns can be dropped and nothing else changes — which is the point of
-- keeping them separate.
--
-- 2. A reference is resolved, not stored as text
--
-- A mapping may say "this column holds a sheet ID belonging to that table". The
-- writer then looks the row up by its `sheet_id` and stores our uuid in the real
-- foreign key. So the app gets working relationships on the first run rather
-- than a pile of text columns somebody has to reconcile later.
--
-- A reference that finds nothing writes null rather than failing: the parent
-- table may simply not have been synced yet. Run the parent's sync, run this
-- one again, and the link appears. That is why the order syncs run in does not
-- have to be got right the first time.
--
-- 3. More tables to sync into
--
-- Three targets was too few to move a business across. The list is still an
-- allow-list — adding one is a migration, which is a review — but it now covers
-- the master data a spreadsheet actually holds.

-- What a target needs -------------------------------------------------------------
-- The primary key is not `id` everywhere: the geo tables are keyed by their
-- official code, and a reference into one has to store that rather than a uuid
-- that does not exist.
alter table public.sync_targets
  add column pk_column text not null default 'id';

-- Where a row came from ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'items', 'brands', 'customers', 'item_categories', 'item_variants',
    'customer_contacts', 'geo_provinces', 'geo_districts', 'geo_communes',
    'departments', 'positions'
  ] loop
    execute format('alter table public.%I add column sheet_id text', t);
    execute format(
      'alter table public.%I add constraint %I check (sheet_id is null or btrim(sheet_id) <> '''')',
      t, t || '_sheet_id_ck');
    -- Partial, so the many rows this app created itself do not collide on null,
    -- and so it can serve as an ON CONFLICT target.
    execute format(
      'create unique index %I on public.%I (sheet_id) where sheet_id is not null',
      t || '_sheet_id_unique', t);
  end loop;
end;
$$;

-- The targets ------------------------------------------------------------------------
insert into public.sync_targets (table_name, label, key_column, conflict_target, pk_column, sort_order) values
  ('item_categories',   'Item Categories',   'name_en', '(sheet_id) where sheet_id is not null', 'id',   4),
  ('item_variants',     'Item Variants',     'sheet_id', '(sheet_id) where sheet_id is not null', 'id',   5),
  ('customer_contacts', 'Customer Contacts', 'sheet_id', '(sheet_id) where sheet_id is not null', 'id',   6),
  ('geo_provinces',     'Provinces',         'code',    '(code)',                                'code', 7),
  ('geo_districts',     'Districts',         'code',    '(code)',                                'code', 8),
  ('geo_communes',      'Communes',          'code',    '(code)',                                'code', 9),
  ('departments',       'Departments',       'name',    '(sheet_id) where sheet_id is not null', 'id',  10),
  ('positions',         'Positions',         'name',    '(sheet_id) where sheet_id is not null', 'id',  11);

-- The geo tables are reference data with an official code; ownership and
-- timestamps are still ours.
update public.sync_targets
   set blocked_columns = array['created_at', 'updated_at', 'created_by', 'owner_id']
 where table_name in ('geo_provinces', 'geo_districts', 'geo_communes');

-- A contact's own flags are the app's to manage, not a sheet's.
update public.sync_targets
   set blocked_columns = blocked_columns || array['active']
 where table_name = 'customer_contacts';

-- How a row is matched ----------------------------------------------------------------
-- Sheet ID by default, because that is what the sheets themselves use and it is
-- stable across a rename. A sync whose sheet has no ID column can fall back to
-- the target's natural key.
create type public.sync_match as enum ('sheet_id', 'natural');

alter table public.sync_definitions
  add column match_on public.sync_match not null default 'sheet_id';

-- A column that points at another table -------------------------------------------------
alter table public.sync_column_maps
  add column reference_table text references public.sync_targets (table_name);

comment on column public.sync_column_maps.reference_table is
  'When set, this sheet column holds a sheet ID belonging to that table. The '
  'writer resolves it to our own key; a reference that finds nothing writes null, '
  'because the parent may not be synced yet.';

-- The writer ------------------------------------------------------------------------------
-- Rewritten rather than replaced in place: the reference columns cannot go
-- through jsonb_populate_record, because the sheet sends a text ID where the
-- column expects a uuid. They are stripped out of the record and resolved
-- alongside it instead.
create or replace function app.sync_apply(p_sync uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table    text;
  v_match    public.sync_match;
  v_conflict text;
  v_collist  text;
  v_selects  text;
  v_updates  text;
  v_refkeys  text[];
  v_written  integer;
begin
  select d.target_table, d.match_on
    into v_table, v_match
    from public.sync_definitions d
   where d.id = p_sync and d.active;

  if v_table is null then
    raise exception 'sync: no active sync %', p_sync using errcode = 'no_data_found';
  end if;

  if v_match = 'sheet_id' then
    v_conflict := '(sheet_id) where sheet_id is not null';
  else
    select t.conflict_target into v_conflict
      from public.sync_targets t where t.table_name = v_table;
  end if;

  -- Every mapped column, re-checked against the allow-list rather than trusted
  -- because a row in sync_column_maps once passed the guard: a column can be
  -- dropped or blocked after a mapping was saved.
  with mapped as (
    select m.target_column, m.reference_table, m.sort_order,
           rt.pk_column as ref_pk
      from public.sync_column_maps m
      left join public.sync_targets rt on rt.table_name = m.reference_table
     where m.sync_id = p_sync
       and m.target_column is not null
       and exists (
         select 1 from app.sync_columns(v_table) c
          where c.column_name = m.target_column
       )
  )
  select
    string_agg(quote_ident(target_column), ', ' order by sort_order),
    string_agg(
      case
        when reference_table is null then format('t.%I', target_column)
        -- Left as null when the parent has not been synced yet. Running the
        -- parent's sync and then this one again fills it in.
        else format(
          '(select x.%I from public.%I x where x.sheet_id = r->>%L)',
          ref_pk, reference_table, target_column)
      end, ', ' order by sort_order),
    string_agg(
      format('%I = excluded.%I', target_column, target_column), ', ' order by sort_order),
    array_remove(array_agg(
      case when reference_table is null then null else target_column end), null)
    into v_collist, v_selects, v_updates, v_refkeys
  from mapped;

  if v_collist is null then
    raise exception 'sync: nothing is mapped' using errcode = 'check_violation';
  end if;

  -- `r - $2` takes the reference keys out before the row type sees them: the
  -- sheet sends a text ID where the column expects a uuid, and the cast would
  -- fail on every row.
  execute format(
    'insert into public.%I (%s) select %s '
    || 'from jsonb_array_elements($1) as r '
    || 'cross join lateral jsonb_populate_record(null::public.%I, r - $2) as t '
    || 'on conflict %s do update set %s',
    v_table, v_collist, v_selects, v_table, v_conflict, v_updates
  ) using p_rows, coalesce(v_refkeys, array[]::text[]);

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke all on function app.sync_apply(uuid, jsonb) from public, authenticated, anon;
grant execute on function app.sync_apply(uuid, jsonb) to service_role;

-- Syncs that already exist keep the rule they were written under -----------------------
-- They map a natural key and know nothing about sheet_id. Switching them to
-- sheet_id matching would make ON CONFLICT infer an index none of their rows
-- are in, so every run would insert rather than update and the table would
-- double nightly. New syncs still default to sheet_id.
update public.sync_definitions set match_on = 'natural';
