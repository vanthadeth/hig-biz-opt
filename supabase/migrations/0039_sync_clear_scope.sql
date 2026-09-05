-- 0039_sync_clear_scope
--
-- 0038 defined "what a sync imported" as rows whose sheet_id is not null. That
-- definition fails in exactly the case the feature exists for.
--
-- The first runs of a sync are the ones with the mapping wrong, and a common
-- way to have it wrong is not to have mapped the sheet's ID column yet. Those
-- rows land with a null sheet_id. Map the ID afterwards and they are
-- unreachable: the next run cannot match them, so it tries to insert them
-- again and collides on some other unique constraint, and clearing reports
-- nothing to clear because by its own definition nothing was imported.
--
-- So clearing now takes a scope. `imported` is the careful one and stays the
-- default. `all` empties the table, which is what somebody actually wants when
-- the first import went in wrong — and is why this was always super admin only
-- with a typed confirmation.

create type public.sync_clear_scope as enum ('imported', 'all');

-- Dropped rather than replaced: a signature cannot grow an argument in place,
-- and leaving the old two-argument version behind would give PostgREST two
-- candidates to choose between.
drop function public.sync_clear(text, boolean);
drop function app.sync_clear(text, boolean);

create function app.sync_clear(
  p_table  text,
  p_commit boolean,
  p_scope  public.sync_clear_scope
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_super boolean;
  v_where    text;
  v_count    integer;
begin
  -- Not app.can: this is not a module permission anybody can be granted. The
  -- only people who may empty a table are the ones who could drop it anyway.
  select u.is_super_admin into v_is_super
    from public.users u
   where u.id = auth.uid() and u.status = 'active';

  if v_is_super is not true then
    raise exception 'Only a super admin may clear synced data'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.sync_targets t where t.table_name = p_table) then
    raise exception 'sync: % is not a table a sync writes to', p_table
      using errcode = 'check_violation';
  end if;

  v_where := case p_scope
    when 'imported' then ' where sheet_id is not null'
    else ''
  end;

  -- Counted the same way it is deleted, so the number somebody confirms is the
  -- number that goes.
  execute format('select count(*) from public.%I%s', p_table, v_where) into v_count;

  if p_commit then
    execute format('delete from public.%I%s', p_table, v_where);
    get diagnostics v_count = row_count;
  end if;

  return v_count;
end;
$$;

revoke all on function app.sync_clear(text, boolean, public.sync_clear_scope)
  from public, authenticated, anon, service_role;

create function public.sync_clear(
  p_table  text,
  p_commit boolean default false,
  p_scope  public.sync_clear_scope default 'imported'
)
returns integer
language sql
security definer
set search_path = ''
as $$ select app.sync_clear(p_table, p_commit, p_scope); $$;

revoke all on function public.sync_clear(text, boolean, public.sync_clear_scope)
  from public, anon;
grant execute on function public.sync_clear(text, boolean, public.sync_clear_scope)
  to authenticated;

comment on function public.sync_clear(text, boolean, public.sync_clear_scope) is
  'Deletes rows in a sync target. Scope `imported` takes only rows with a '
  'sheet_id; `all` empties the table, which is what a first import that went in '
  'without its IDs needs. Super admin only. Pass p_commit false to count what '
  'would go without deleting it.';

-- PostgREST answers from a cached picture of the schema, and a function it has
-- not seen is a function that does not exist.
notify pgrst, 'reload schema';
