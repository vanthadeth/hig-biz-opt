-- 0020_can_delete_user
--
-- The companion to can_edit_user (0017), and for the same reason: my_permissions
-- reports reach without a subject, so it cannot answer "may I delete *this*
-- person". Asking the database means the button and the policy can never
-- disagree, and app.is_subordinate stays implemented once.

create function public.can_delete_user(p_user uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app.can('user', 'delete', p_user);
$$;

grant execute on function public.can_delete_user(uuid) to authenticated;

-- As 0012: PUBLIC gets execute on a new function by default and `anon` inherits
-- it. Harmless — with no auth.uid() it is false — but the default is wrong.
revoke execute on function public.can_delete_user(uuid) from public;
