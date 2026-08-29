-- 0001_core_enums_and_org
-- Enums plus the organisational reference tables (departments, positions, roles, modules).

create schema if not exists app;

create type public.gender as enum ('male', 'female', 'other');
create type public.user_status as enum ('active', 'suspended', 'discharged');
create type public.permission_action as enum ('view', 'add', 'edit', 'delete');
create type public.permission_scope as enum ('own', 'sub', 'any');
create type public.permission_effect as enum ('allow', 'deny');

-- Departments -----------------------------------------------------------------
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Positions -------------------------------------------------------------------
-- Position is free text on the user record. Every distinct value ever entered is
-- collected here so the field can offer an autocomplete list built from prior
-- entries, without constraining what may be typed.
create table public.positions (
  name        text primary key,
  use_count   integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Roles -----------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null unique,
  description text,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Modules ---------------------------------------------------------------------
-- One row per permission-bearing area of the system. `key` is the identifier used
-- by role_permissions, user_permission_overrides and the frontend module registry.
create table public.modules (
  key         text primary key,
  name        text not null,
  icon        text not null default 'square',
  href        text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true
);

create index on public.departments (sort_order);
create index on public.roles (sort_order);
create index on public.modules (sort_order);
