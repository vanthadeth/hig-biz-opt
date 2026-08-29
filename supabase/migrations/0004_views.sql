-- 0004_views
-- A view is a workspace: its own landing page and its own navigation set. It is
-- separate from role, because one person may work in more than one of them.

create table public.views (
  key         text primary key,
  name        text not null,
  description text,
  icon        text not null default 'square',
  sort_order  integer not null default 0,
  active      boolean not null default true
);

-- The navigation set for a view.
create table public.view_modules (
  view_key    text not null references public.views (key) on delete cascade,
  module_key  text not null references public.modules (key) on delete cascade,
  sort_order  integer not null default 0,
  primary key (view_key, module_key)
);

-- Default views for a role.
create table public.role_views (
  role_id     uuid not null references public.roles (id) on delete cascade,
  view_key    text not null references public.views (key) on delete cascade,
  sort_order  integer not null default 0,
  primary key (role_id, view_key)
);

-- Per-user grant/revoke on top of the role defaults. This is how a view is
-- assigned to (or withheld from) an individual.
create table public.user_views (
  user_id     uuid not null references public.users (id) on delete cascade,
  view_key    text not null references public.views (key) on delete cascade,
  effect      public.permission_effect not null,
  note        text,
  primary key (user_id, view_key)
);

create index on public.view_modules (view_key, sort_order);
create index on public.role_views (role_id, sort_order);
