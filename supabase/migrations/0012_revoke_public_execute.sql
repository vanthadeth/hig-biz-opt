-- 0012_revoke_public_execute
-- Postgres grants EXECUTE on new functions to PUBLIC, so `anon` inherits it even
-- after 0011 revoked its own privileges. The three RPCs are safe called
-- anonymously — with no auth.uid() they resolve to an empty result — but relying
-- on every future function being safe by accident is the wrong default.

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema app revoke execute on functions from public;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema app from public;

-- Re-state what the frontend actually calls.
grant execute on function public.my_permissions() to authenticated;
grant execute on function public.my_views() to authenticated;
grant execute on function public.my_nav(text) to authenticated;

grant execute on function app.my_permissions() to authenticated;
grant execute on function app.my_views() to authenticated;
grant execute on function app.my_nav(text) to authenticated;
grant execute on function app.can(text, public.permission_action, uuid) to authenticated;
grant execute on function app.is_subordinate(uuid, uuid) to authenticated;
grant execute on function app.current_user_id() to authenticated;
