-- 0036b_sync_apply_wrapper
--
-- 0036 put the writer in the app schema, where nothing reaches it: PostgREST
-- only exposes functions in `public`, so the sync engine had no way to call the
-- one function it exists to call.
--
-- A wrapper rather than moving it. `app.sync_apply` holds the checks and stays
-- where the rest of the privileged logic lives; this is the doorway, and it is
-- open to the service role alone. A signed-in person cannot call either one.
create function public.sync_apply(p_sync uuid, p_rows jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$ select app.sync_apply(p_sync, p_rows); $$;

revoke all on function public.sync_apply(uuid, jsonb) from public, authenticated, anon;
grant execute on function public.sync_apply(uuid, jsonb) to service_role;
