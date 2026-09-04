-- 0035_telegram_check_ins
--
-- Attendance, recorded from Telegram.
--
-- The team is in the field, and until now there was nowhere to say "I started
-- work, here, at this time". A browser, a sign-in and a form is the reason that
-- record never got made; Telegram is already on the phone, and a Mini App opens
-- from a chat in two taps.
--
-- Three things arrive together:
--
--   * a numeric Telegram account on the employee record, so a launch can be
--     matched to a person without anybody typing anything;
--   * check_ins, an append-only log of punches, each carrying where the person
--     was and a photograph of them;
--   * a private bucket for those photographs, reached by the same scope rule
--     that reaches the row.
--
-- Nothing here appears in anybody's navigation. The module exists to be
-- granted and checked, the way customer_credit does in 0032 — the screen that
-- reads these records is a later change, and it will add the view_modules row.

-- The Telegram account ------------------------------------------------------------
-- public.users already carries telegram_id, which is a handle somebody typed in
-- for a human to read: "@sokha". It is not an identity — handles change, are
-- given up and are re-registered by other people. Telegram signs a numeric
-- account id, and that is what a launch has to be matched on, so it goes beside
-- the handle rather than on top of it.
alter table public.users
  add column telegram_user_id bigint;

comment on column public.users.telegram_user_id is
  'Numeric Telegram account, from signed initData. Distinct from telegram_id, which is a handle typed in by hand.';

-- Partial, so the many employees with no Telegram account do not collide on null.
create unique index users_telegram_user_id_unique
  on public.users (telegram_user_id)
  where telegram_user_id is not null;

-- 0021 listed, by name, every column you may not change on your own row. A
-- column added afterwards is absent from that list and therefore editable —
-- which would let anyone point their own record at their own Telegram account,
-- or off somebody else's, straight over PostgREST.
--
-- Binding is done by the mini app's route handler holding the secret key, where
-- auth.uid() is null and the first branch below steps aside. Everything else in
-- this function is 0021 unchanged.
create or replace function public.guard_self_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Not a signed-in request at all: a migration, the signup trigger re-keying a
  -- record, the mini app binding a Telegram account, or an administrative fix
  -- run directly against the database.
  if auth.uid() is null then
    return new;
  end if;

  -- Somebody else's row. The policy already decided whether that is allowed.
  if new.id is distinct from auth.uid() then
    return new;
  end if;

  -- Your own row, but you hold the user module over yourself: an administrator
  -- correcting their own record is doing the same job as correcting anyone's.
  if app.can('user', 'edit', new.id) then
    return new;
  end if;

  if (new.id, new.full_name, new.gender, new.date_of_birth, new.phone_primary,
      new.telegram_id, new.telegram_user_id, new.email, new.department_id,
      new.position, new.manager_id, new.employment_date, new.role_id,
      new.bank_name, new.bank_account_name, new.bank_account_number, new.status,
      new.suspended_from, new.suspended_to, new.discharged_date,
      new.status_note, new.status_changed_by, new.is_super_admin,
      new.must_change_password)
     is distinct from
     (old.id, old.full_name, old.gender, old.date_of_birth, old.phone_primary,
      old.telegram_id, old.telegram_user_id, old.email, old.department_id,
      old.position, old.manager_id, old.employment_date, old.role_id,
      old.bank_name, old.bank_account_name, old.bank_account_number, old.status,
      old.suspended_from, old.suspended_to, old.discharged_date,
      old.status_note, old.status_changed_by, old.is_super_admin,
      old.must_change_password)
  then
    raise exception
      'You may only change your own nickname, photo and secondary phone number'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- create or replace keeps the existing privileges, but 0023 restates the revoke
-- rather than trusting that, and so does this.
revoke execute on function public.guard_self_edit()
  from public, anon, authenticated, service_role;

-- The punch -----------------------------------------------------------------------
create type public.check_in_kind as enum ('in', 'out');

create table public.check_ins (
  id              uuid primary key default gen_random_uuid(),
  -- As customers.owner_id in 0025: the column defaults to the caller, so a
  -- person holding 'add' at 'own' scope never sends an owner they could lie
  -- about. on delete restrict, because an attendance record outlives the
  -- employee's tenure and is the kind of thing somebody asks about afterwards.
  user_id         uuid not null default auth.uid()
                    references public.users (id) on update cascade on delete restrict,
  kind            public.check_in_kind not null,
  -- Stamped by the trigger below whenever a person is doing the punching, never
  -- taken from the client. See stamp_check_in.
  occurred_at     timestamptz not null default now(),
  latitude        numeric(9, 6) not null,
  longitude       numeric(9, 6) not null,
  -- The reading's own claim about itself, in metres. Null when the source did
  -- not say; a 500 m fix and a 5 m fix are not the same evidence.
  accuracy_m      numeric(8, 1),
  location_source text not null,
  photo_path      text not null,
  note            text,
  created_at      timestamptz not null default now(),

  constraint check_ins_latitude_ck  check (latitude  between  -90 and  90),
  constraint check_ins_longitude_ck check (longitude between -180 and 180),
  constraint check_ins_accuracy_ck  check (accuracy_m is null or accuracy_m >= 0),
  constraint check_ins_photo_path_ck check (btrim(photo_path) <> ''),
  -- Telegram's own location manager, or the browser's. Which one answered is
  -- part of the record: they are different instruments.
  constraint check_ins_location_source_ck check (location_source in ('telegram', 'browser'))
);

comment on table public.check_ins is
  'Attendance punches from the Telegram mini app. Append-only: there is no update or delete path.';

-- Unlike customers, where coordinates are optional and only have to agree with
-- each other, both of these are required. A punch without them is not the thing
-- being asked for.
create index check_ins_by_person on public.check_ins (user_id, occurred_at desc);
create index check_ins_recent    on public.check_ins (occurred_at desc);

-- The clock is the server's ---------------------------------------------------------
-- A phone's clock is a setting. The entire value of an attendance record is
-- that the time on it was not chosen by the person it is about — and the policy
-- above admits any occurred_at a rep cares to send, because row level security
-- chooses rows and not columns. So whatever arrives is discarded.
--
-- A caller with no JWT keeps what it sent: that is a migration, a data fix, or
-- a backfill, and none of those is somebody punching. It is the same carve-out
-- guard_credit_limit makes in 0032, for the same reason.
create function public.stamp_check_in()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.occurred_at := now();
  end if;
  return new;
end;
$$;

create trigger check_ins_stamp
  before insert on public.check_ins
  for each row execute function public.stamp_check_in();

-- Callable only as a trigger, as 0023 established for the others.
revoke execute on function public.stamp_check_in()
  from public, anon, authenticated, service_role;

-- The permission ------------------------------------------------------------------
-- No view_modules row, so it never appears in anybody's navigation. app.my_nav
-- reads view_modules; app.can and the permission matrix read modules. That
-- split is what lets a permission exist before its screen does.
insert into public.modules (key, name, icon, href, sort_order, group_name) values
  ('check_in', 'Check-in', 'pin', 'check-ins', 12, 'People');

-- Everybody punches for themselves and sees their own. That is the floor, and
-- it is what makes the mini app work for a new employee without anybody
-- configuring anything.
insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'check_in', a.action::public.permission_action, 'own'::public.permission_scope
from public.roles r
cross join (values ('view'), ('add')) as a(action);

-- Reviewing a team is a different reach. A supervisor and a manager see the
-- people who report to them; HR and the administrator see everyone. Nobody is
-- given 'add' beyond their own — punching for somebody else is not a thing this
-- module does, whatever your rank.
update public.role_permissions set scope = 'sub'
 where module_key = 'check_in' and action = 'view'
   and role_id in (select id from public.roles where key in ('sales_supervisor', 'sales_manager'));

update public.role_permissions set scope = 'any'
 where module_key = 'check_in' and action = 'view'
   and role_id in (select id from public.roles where key in ('system_admin', 'hr'));

-- Row level security ---------------------------------------------------------------
alter table public.check_ins enable row level security;

create policy check_ins_select on public.check_ins
  for select to authenticated
  using (app.can('check_in', 'view', user_id));

create policy check_ins_insert on public.check_ins
  for insert to authenticated
  with check (app.can('check_in', 'add', user_id));

-- No update policy and no delete policy, on purpose. An attendance record is an
-- event, not a form: once it is made, the only honest thing to do with it is
-- read it. As with audit_log in 0030, the missing grant is the half that does
-- the work — Supabase hands `authenticated` full DML on a new table in public,
-- so a policy nobody wrote is not by itself a refusal.
revoke all on public.check_ins from authenticated;
grant select, insert on public.check_ins to authenticated;

-- The photographs -------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'check-ins', 'check-ins', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- Objects sit under "<user id>/…", so the person punched is the first path
-- segment and the same scope rule reaches the photograph as reaches the row.
create policy check_ins_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'check-ins'
    and app.can('check_in', 'view', ((storage.foldername(name))[1])::uuid)
  );

create policy check_ins_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'check-ins'
    and app.can('check_in', 'add', ((storage.foldername(name))[1])::uuid)
  );

-- No update or delete policy, for the reason the table has none.

-- Not audited ------------------------------------------------------------------------
-- record_audit() is deliberately not attached. The audit log says who changed a
-- record that has a current state; a check-in has no current state to change,
-- and no update or delete path to reach it by. Auditing it would write a second
-- copy of every row and say nothing the first copy already does.
--
-- The binding is covered, though: telegram_user_id lives on public.users, which
-- has carried users_audit since 0030.
