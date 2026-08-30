-- 0023_lock_down_trigger_functions
--
-- 0012 said "a trigger function is not API surface" and wrote
--
--     revoke execute on function public.<fn>() from public;
--
-- after each one. That was the right intent and the wrong statement, and the
-- difference only shows up on functions created after 0012 ran.
--
-- Postgres grants EXECUTE on a new function to PUBLIC, which 0012 turned off
-- for this schema. But the Supabase project *also* carries default privileges
-- that grant EXECUTE on new functions in `public` to `authenticated` and
-- `service_role` by name. Revoking from PUBLIC does nothing to a grant held by
-- a role directly, so every trigger function written since — stamp_user_status
-- (0019), guard_self_edit (0021), guard_category_depth (0022) — ended up
-- callable over PostgREST at /rest/v1/rpc/<name>.
--
-- Calling one is not an exploit: Postgres refuses to run a trigger function
-- outside a trigger. But an endpoint that exists only to return an error is
-- still an endpoint, and the next such function might not be a trigger.
--
-- The two functions from before 0012 (handle_new_auth_user, harvest_position,
-- set_updated_at) are already `{postgres=X/postgres}` and stay that way.

revoke execute on function public.stamp_user_status()    from public, anon, authenticated, service_role;
revoke execute on function public.guard_self_edit()      from public, anon, authenticated, service_role;
revoke execute on function public.guard_category_depth() from public, anon, authenticated, service_role;

-- And stop the default from re-arming for whatever comes next, so a future
-- trigger function does not have to remember this on its own.
alter default privileges in schema public
  revoke execute on functions from anon, authenticated, service_role;

-- A missing search_path on stamp_user_status ---------------------------------
-- Every other function in the schema pins it; this one was written without.
-- It is security invoker, so the risk is smaller than it would be on a definer
-- function, but "smaller" is not the standard the rest of the schema holds to.
-- `now()` still resolves under an empty path because pg_catalog is always
-- searched, and auth.uid() was already qualified.
alter function public.stamp_user_status() set search_path = '';
