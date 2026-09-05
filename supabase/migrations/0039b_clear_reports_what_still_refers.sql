-- 0039b_clear_reports_what_still_refers
--
-- Emptying a table nothing else depends on is easy. Emptying `brands` while
-- `items` still points at it fails with a message naming a constraint, which
-- tells nobody what to do about it.
--
-- The referencing table is the thing to clear first, so the error says that
-- instead. Nothing is deleted either way — the delete is one statement, so a
-- refusal leaves the table exactly as it was.
create or replace function app.sync_clear(
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
  v_holder   text;
begin
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

  execute format('select count(*) from public.%I%s', p_table, v_where) into v_count;

  if p_commit then
    begin
      execute format('delete from public.%I%s', p_table, v_where);
      get diagnostics v_count = row_count;
    exception when foreign_key_violation then
      get stacked diagnostics v_holder = table_name;
      raise exception
        'Nothing was cleared: rows in % still refer to %. Clear % first, then come back.',
        coalesce(v_holder, 'another table'), p_table, coalesce(v_holder, 'it')
        using errcode = 'foreign_key_violation';
    end;
  end if;

  return v_count;
end;
$$;

revoke all on function app.sync_clear(text, boolean, public.sync_clear_scope)
  from public, authenticated, anon, service_role;

notify pgrst, 'reload schema';
