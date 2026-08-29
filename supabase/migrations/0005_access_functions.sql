-- 0005_access_functions
-- Access resolution lives in the database so the UI and RLS can never disagree.
-- Everything here is security definer: these functions read public.users while
-- being called from that table's own policies, so they must bypass RLS.

-- Who is asking ---------------------------------------------------------------
create function app.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid();
$$;

-- Is `p_target` somewhere below `p_manager` in the report-to chain? ------------
create function app.is_subordinate(p_manager uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chain as (
    select u.id, u.manager_id
    from public.users u
    where u.id = p_target
    union all
    select u.id, u.manager_id
    from public.users u
    join chain c on u.id = c.manager_id
  )
  select exists (
    select 1 from chain where chain.manager_id = p_manager
  );
$$;

-- The scope a user holds for one module/action, or null for no access ---------
-- Resolution order: inactive employee -> nothing; super admin -> any;
-- deny override; allow override; role permission; otherwise nothing.
create function app.effective_scope(
  p_user   uuid,
  p_module text,
  p_action public.permission_action
)
returns public.permission_scope
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status  public.user_status;
  v_super   boolean;
  v_role_id uuid;
  v_effect  public.permission_effect;
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

  select o.effect, o.scope into v_effect, v_scope
  from public.user_permission_overrides o
  where o.user_id = p_user and o.module_key = p_module and o.action = p_action;

  if found then
    if v_effect = 'deny' then
      return null;
    end if;
    return v_scope;
  end if;

  select rp.scope into v_scope
  from public.role_permissions rp
  where rp.role_id = v_role_id and rp.module_key = p_module and rp.action = p_action;

  return v_scope;
end;
$$;

-- Can the caller perform `p_action` on `p_module`? ----------------------------
-- With p_owner given, the scope is tested against that record's owner. With
-- p_owner null the question is only "does the caller hold this at all", which is
-- what nav entries and create buttons need.
create function app.can(
  p_module text,
  p_action public.permission_action,
  p_owner  uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me    uuid := auth.uid();
  v_scope public.permission_scope;
begin
  v_scope := app.effective_scope(v_me, p_module, p_action);

  if v_scope is null then
    return false;
  end if;

  if v_scope = 'any' then
    return true;
  end if;

  if p_owner is null then
    return true;
  end if;

  if p_owner = v_me then
    return true;
  end if;

  if v_scope = 'sub' then
    return app.is_subordinate(v_me, p_owner);
  end if;

  return false;
end;
$$;

-- The caller's whole effective permission set, in one round trip ---------------
create function app.my_permissions()
returns table (module_key text, action public.permission_action, scope public.permission_scope)
language sql
stable
security definer
set search_path = ''
as $$
  select m.key, a.action, app.effective_scope(auth.uid(), m.key, a.action)
  from public.modules m
  cross join (
    select unnest(enum_range(null::public.permission_action)) as action
  ) a
  where m.active
    and app.effective_scope(auth.uid(), m.key, a.action) is not null
  order by m.sort_order, a.action;
$$;

-- The views the caller may enter ----------------------------------------------
-- Role defaults, plus per-user grants, minus per-user revokes. A super admin
-- reaches every active view.
create function app.my_views()
returns table (key text, name text, description text, icon text, sort_order integer)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select u.id, u.role_id, u.is_super_admin, u.status
    from public.users u
    where u.id = auth.uid()
  ),
  entitled as (
    select rv.view_key
    from public.role_views rv
    join me on me.role_id = rv.role_id
    union
    select uv.view_key
    from public.user_views uv
    join me on me.id = uv.user_id
    where uv.effect = 'allow'
  ),
  revoked as (
    select uv.view_key
    from public.user_views uv
    join me on me.id = uv.user_id
    where uv.effect = 'deny'
  )
  select v.key, v.name, v.description, v.icon, v.sort_order
  from public.views v
  cross join me
  where v.active
    and me.status = 'active'
    and (
      me.is_super_admin
      or (v.key in (select view_key from entitled) and v.key not in (select view_key from revoked))
    )
  order by v.sort_order, v.name;
$$;

-- The navigation set for one view, filtered by what the caller may view --------
create function app.my_nav(p_view text)
returns table (module_key text, name text, icon text, href text, sort_order integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.key, m.name, m.icon, m.href, vm.sort_order
  from public.view_modules vm
  join public.modules m on m.key = vm.module_key
  where vm.view_key = p_view
    and m.active
    and exists (select 1 from app.my_views() mv where mv.key = p_view)
    and app.can(m.key, 'view')
  order by vm.sort_order, m.name;
$$;

grant usage on schema app to authenticated;
grant execute on function app.current_user_id() to authenticated;
grant execute on function app.is_subordinate(uuid, uuid) to authenticated;
grant execute on function app.can(text, public.permission_action, uuid) to authenticated;
grant execute on function app.my_permissions() to authenticated;
grant execute on function app.my_views() to authenticated;
grant execute on function app.my_nav(text) to authenticated;

-- PostgREST only exposes `public`, so the three functions the frontend calls get
-- thin wrappers there. The `app` schema stays internal.
create function public.my_permissions()
returns table (module_key text, action public.permission_action, scope public.permission_scope)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app.my_permissions();
$$;

create function public.my_views()
returns table (key text, name text, description text, icon text, sort_order integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app.my_views();
$$;

create function public.my_nav(p_view text)
returns table (module_key text, name text, icon text, href text, sort_order integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app.my_nav(p_view);
$$;

grant execute on function public.my_permissions() to authenticated;
grant execute on function public.my_views() to authenticated;
grant execute on function public.my_nav(text) to authenticated;
