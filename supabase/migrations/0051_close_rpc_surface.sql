-- 0051_close_rpc_surface
--
-- Functions that were never meant to be an API.
--
-- PostgREST publishes every function in `public` that the caller may execute,
-- and Postgres grants EXECUTE on a new function to PUBLIC unless told
-- otherwise. Those two defaults meet in the middle: a trigger function written
-- for a table ends up as an endpoint at /rest/v1/rpc/, callable by anybody
-- holding the anon key — which is to say, by anybody who has opened the app.
--
-- Four of them were sitting there.
--
-- THE ONE THAT MATTERED is `public.sync_columns`. It is security definer, it
-- lists the columns of a sync target, and 0036 granted it to `authenticated`
-- without revoking the default first — so the grant that was written down was
-- not the grant that was in force, and `anon` could enumerate the shape of
-- those tables without signing in. It keeps its `authenticated` grant, which
-- the sync form genuinely uses; it loses the one nobody wrote.
--
-- THE OTHER THREE are trigger functions — `guard_visit_edit`,
-- `guard_customer_geo`'s filler, and `guard_sync_column`. Calling one directly
-- fails, because a trigger function has no trigger context to read, so the
-- practical exposure was small; but "it errors when you call it" is not a
-- security boundary, it is a coincidence of the error path. They should not
-- have been reachable at all.
--
-- REVOKING DOES NOT DISARM THE TRIGGERS. Postgres does not check EXECUTE on a
-- trigger function when firing a trigger — the executor calls it directly, as
-- the table's owner. The guards go on guarding; they simply stop being an
-- endpoint. The test at the bottom of visits.test.sql proves it either way.

revoke all on function public.sync_columns(text) from public, anon;
grant execute on function public.sync_columns(text) to authenticated;

revoke all on function public.guard_visit_edit() from public, anon, authenticated;
revoke all on function public.fill_customer_geo() from public, anon, authenticated;
revoke all on function public.guard_sync_column() from public, anon, authenticated;

-- A search path nobody pinned ---------------------------------------------------------
-- Security invoker, so this runs as whoever called it and the exposure is far
-- smaller than a definer function's — but an unqualified name is still resolved
-- against whatever search_path the session happens to carry, and the fix costs
-- one line. The body is unchanged: 500, read back off the live schema rather
-- than remembered.
create or replace function app.default_credit_limit()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 500::numeric $$;

notify pgrst, 'reload schema';
