-- 0061_sync_engine_reads_columns
--
-- The sub-category sync failed the way it did — every row, with an opaque
-- "invalid input syntax for type uuid" — because nothing checked, before the
-- write, that a uuid-typed target column was being fed a sheet's own id
-- scheme with no reference to resolve it against ours. Our id and the
-- sheet's are different kinds of value: a uuid we generated, against
-- whatever the sheet happens to use for the same idea. `syncProblems` in
-- src/lib/sync.ts now catches that on the screen that saves a mapping; the
-- run is the other half of "checked here as well as in the screen that saved
-- it" (see 0037's comment on the same idea, for a broken reference) — a
-- mapping can be edited to point at a column that turns out to be a uuid, or
-- be wrong from the first save the way this one was.
--
-- The run has no session to call `public.sync_columns` as, and that
-- wrapper's own `app.can('data_sync', 'view')` gate would refuse it anyway —
-- there is no signed-in user behind the service role. What it needs is the
-- ungated catalogue lookup underneath, reached the same way 0036b reached
-- `app.sync_apply`: PostgREST only routes to `public`, so the doorway is a
-- second, service-role-only wrapper rather than widening the first one past
-- what a signed-in person should be able to call.

create function public.sync_columns_for_engine(p_table text)
returns table (column_name text, data_type text, is_required boolean)
language sql
stable
security definer
set search_path = ''
as $$ select column_name, data_type, is_required from app.sync_columns(p_table); $$;

revoke all on function public.sync_columns_for_engine(text) from public, authenticated, anon;
grant execute on function public.sync_columns_for_engine(text) to service_role;
