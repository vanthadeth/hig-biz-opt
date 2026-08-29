-- 0002_users
-- The employee record. `id` is the auth.users id, so a profile and a login are the
-- same identity and RLS can key off auth.uid() directly.

create table public.users (
  id                    uuid primary key references auth.users (id) on delete cascade,

  -- Personal information
  full_name             text not null,
  nickname              text,
  gender                public.gender,
  date_of_birth         date,          -- not exposed publicly, see user_directory
  photo_path            text,          -- object path in the private `avatars` bucket

  -- Contacts
  phone_primary         text,
  phone_secondary       text,
  telegram_id           text,
  email                 text,

  -- Position and role
  department_id         uuid references public.departments (id) on delete set null,
  position              text,
  manager_id            uuid references public.users (id) on delete set null,   -- report to
  employment_date       date,
  role_id               uuid references public.roles (id) on delete restrict,

  -- Bank account information (payroll)
  bank_name             text,
  bank_account_name     text,
  bank_account_number   text,

  -- Status
  status                public.user_status not null default 'active',
  suspended_from        date,
  suspended_to          date,
  discharged_date       date,
  status_note           text,
  status_changed_at     timestamptz,
  status_changed_by     uuid references public.users (id) on delete set null,

  is_super_admin        boolean not null default false,
  must_change_password  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- A suspension carries a date range; a discharge carries a date. Anything else
  -- would leave the status unreadable on screen.
  constraint users_suspension_dates_ck check (
    status <> 'suspended'
    or (suspended_from is not null and suspended_to is not null and suspended_to >= suspended_from)
  ),
  constraint users_discharge_date_ck check (
    status <> 'discharged' or discharged_date is not null
  ),
  constraint users_not_own_manager_ck check (manager_id is null or manager_id <> id)
);

create index on public.users (role_id);
create index on public.users (manager_id);
create index on public.users (department_id);
create index on public.users (status);

-- updated_at ------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Position harvesting ---------------------------------------------------------
-- Keeps public.positions in step with whatever has actually been typed, so the
-- position field can suggest previous entries.
create function public.harvest_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.position is not null and btrim(new.position) <> '' then
    insert into public.positions (name, use_count)
    values (btrim(new.position), 1)
    on conflict (name) do update set use_count = public.positions.use_count + 1;
  end if;
  return new;
end;
$$;

create trigger users_harvest_position
  after insert or update of position on public.users
  for each row execute function public.harvest_position();

-- Profile provisioning --------------------------------------------------------
-- Creating an auth user creates the matching profile row. full_name and role come
-- from the invite metadata when present, otherwise sensible fallbacks that an
-- admin corrects later.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
begin
  select id into v_role_id
  from public.roles
  where key = coalesce(new.raw_user_meta_data ->> 'role_key', 'sales')
  limit 1;

  if v_role_id is null then
    select id into v_role_id from public.roles order by sort_order limit 1;
  end if;

  insert into public.users (id, full_name, email, role_id)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    v_role_id
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
