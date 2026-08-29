-- 0003_permissions
-- Permission is granted per role, per module, per action, at a scope.
-- A per-user override layers on top and can both grant and revoke.

create table public.role_permissions (
  role_id     uuid not null references public.roles (id) on delete cascade,
  module_key  text not null references public.modules (key) on delete cascade,
  action      public.permission_action not null,
  scope       public.permission_scope not null,
  primary key (role_id, module_key, action)
);

create table public.user_permission_overrides (
  user_id     uuid not null references public.users (id) on delete cascade,
  module_key  text not null references public.modules (key) on delete cascade,
  action      public.permission_action not null,
  effect      public.permission_effect not null,
  -- Scope is required when granting and meaningless when revoking.
  scope       public.permission_scope,
  note        text,
  primary key (user_id, module_key, action),
  constraint user_permission_overrides_scope_ck check (
    (effect = 'allow' and scope is not null) or (effect = 'deny' and scope is null)
  )
);

create index on public.role_permissions (module_key);
create index on public.user_permission_overrides (module_key);
