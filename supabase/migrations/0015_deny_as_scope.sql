-- 0015_deny_as_scope
-- One concept instead of two.
--
-- A permission used to be an effect (allow or deny) plus a scope that had to be
-- null when denying, held together by a CHECK. Now the scope says everything:
-- any / sub / own grant at that reach, and `deny` refuses. An override is
-- simply the scope this person gets instead of their role's, which covers both
-- directions of the override without a second column.
--
-- An absent role_permissions row still means no access. The difference is that
-- a `deny` row is a decision somebody made, and can be told apart from a
-- permission nobody has configured — which is what the matrix screen needs in
-- order to show an explicit state in every cell.

alter table public.user_permission_overrides
  drop constraint user_permission_overrides_scope_ck;

-- Existing revokes carried a null scope; they become explicit denials.
update public.user_permission_overrides set scope = 'deny' where effect = 'deny';

alter table public.user_permission_overrides
  alter column scope set not null;

alter table public.user_permission_overrides
  drop column effect;

-- Resolution order is unchanged; only the shape of a refusal moved.
create or replace function app.effective_scope(
  p_user   uuid,
  p_module text,
  p_action public.permission_action
)
returns public.permission_scope
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_status  public.user_status;
  v_super   boolean;
  v_role_id uuid;
  v_scope   public.permission_scope;
begin
  if p_user is null then
    return null;
  end if;

  select u.status, u.is_super_admin, u.role_id
    into v_status, v_super, v_role_id
  from public.users u
  where u.id = p_user;

  if not found or v_status <> 'active' then
    return null;
  end if;

  if v_super then
    return 'any';
  end if;

  -- A per-user override replaces the role's answer outright, in either
  -- direction: it may grant what the role lacks or refuse what the role allows.
  select o.scope into v_scope
  from public.user_permission_overrides o
  where o.user_id = p_user and o.module_key = p_module and o.action = p_action;

  if not found then
    select rp.scope into v_scope
    from public.role_permissions rp
    where rp.role_id = v_role_id and rp.module_key = p_module and rp.action = p_action;
  end if;

  -- Callers ask "what reach do I have"; no access is the absence of an answer,
  -- so an explicit denial is reported the same way an unset permission is.
  if v_scope = 'deny' then
    return null;
  end if;

  return v_scope;
end;
$fn$;
