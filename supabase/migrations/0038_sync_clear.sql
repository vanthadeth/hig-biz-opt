-- 0038_sync_clear
--
-- Clearing what a sync imported, so a mapping got wrong the first time can be
-- undone rather than lived with. Mapping a spreadsheet somebody else built is a
-- guess, and the second guess is better; without this, the first one is
-- permanent.
--
-- What it deletes, exactly: rows in the target table whose `sheet_id` is not
-- null. That is the definition of "came from a sheet", and it is why sheet_id
-- was worth having beyond resolving references. Rows this app created itself
-- have no sheet_id and are not touched, so clearing the imported catalogue does
-- not take the items somebody entered by hand with it.
--
-- Super admin only, and checked here rather than only in the screen. A
-- destructive action guarded by a button that happens not to be rendered is not
-- guarded. The check reads auth.uid(), so this must be called with the person's
-- own connection — the service role has no identity and is refused.
--
-- Every deleted row goes through the audit trigger from 0030, stamped with who
-- did it. That is the record, and it is why this does not keep one of its own.

create function app.sync_clear(p_table text, p_commit boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_super boolean;
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

  -- Counted the same way it is deleted, so the number somebody confirms is the
  -- number that goes.
  execute format(
    'select count(*) from public.%I where sheet_id is not null', p_table
  ) into v_count;

  if p_commit then
    execute format('delete from public.%I where sheet_id is not null', p_table);
    get diagnostics v_count = row_count;
  end if;

  return v_count;
end;
$$;

revoke all on function app.sync_clear(text, boolean) from public, authenticated, anon, service_role;

-- The doorway. Definer for the same reason every other wrapper here is: nobody
-- holds EXECUTE on the app schema. The permission check is inside.
create function public.sync_clear(p_table text, p_commit boolean default false)
returns integer
language sql
security definer
set search_path = ''
as $$ select app.sync_clear(p_table, p_commit); $$;

revoke all on function public.sync_clear(text, boolean) from public, anon;
grant execute on function public.sync_clear(text, boolean) to authenticated;

comment on function public.sync_clear(text, boolean) is
  'Deletes rows in a sync target whose sheet_id is not null — everything a sync '
  'imported, and nothing this app created itself. Super admin only. Pass '
  'p_commit false to count what would go without deleting it.';
