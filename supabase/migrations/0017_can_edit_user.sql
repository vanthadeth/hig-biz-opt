-- 0017_can_edit_user
--
-- my_permissions() reports reach — own, sub or any — but not whether that reach
-- covers one particular person. The user record screen needs the second
-- question: may I change *this* employee? Asking it any other way in the client
-- would mean re-implementing app.is_subordinate in TypeScript, and a second
-- implementation of an access rule is a second thing to get wrong.
--
-- This asks the database the same question the policy will ask on write, so the
-- screen and the enforcement can never disagree.

create function public.can_edit_user(p_user uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app.can('user', 'edit', p_user);
$$;

grant execute on function public.can_edit_user(uuid) to authenticated;

-- As 0012: PUBLIC gets execute on a new function by default, and `anon` inherits
-- it. Harmless here — with no auth.uid() it resolves to false — but the default
-- is still wrong.
revoke execute on function public.can_edit_user(uuid) from public;
