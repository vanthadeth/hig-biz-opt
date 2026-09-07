-- 0047_visits_and_attendance
--
-- A rep's day, recorded where it happens.
--
-- A visit is one call on one shop: opened by checking in outside it, closed by
-- checking out. What is written in between — what kind of call it was, whether
-- an order came of it, whether money did — is the record the office reads
-- afterwards, and the two timestamps are what the day is measured with.
--
-- THE TIMESTAMPS ARE THE EVIDENCE. Everything else on a visit can be corrected
-- for a day afterwards, because people write "no order" and then get one an
-- hour later. The check-in and check-out times cannot be corrected at all, by
-- anybody, and a trigger says so rather than a form remembering to. A record of
-- where somebody was and when is worth nothing if it can be tidied up later.
--
-- DISTANCE IS RECORDED, NOT ENFORCED. The rep's own position is stored beside
-- the shop's, and how far apart they were, and whether that was further than
-- the setting allows. A phone inside a concrete building can be three hundred
-- metres out; refusing the check-in would lose a real visit to protect a
-- number. The flag is what the report filters on.
--
-- A SHOP WITH NO PIN is still a shop somebody visited. The distance is null —
-- unknown, which is not the same as far — and the rep's own position is kept,
-- so the shop can be pinned from where its visitors actually stood.

-- What the four dropdowns offer ------------------------------------------------------
-- Rows rather than enums, because these are the business's words and it will
-- want different ones by March. An enum would be a migration every time.
create type public.visit_option_kind as enum (
  'visit_type', 'visit_status', 'order_status', 'payment_status'
);

create table public.visit_options (
  id         uuid primary key default gen_random_uuid(),
  kind       public.visit_option_kind not null,
  label      text not null,
  sort_order integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint visit_options_label_ck check (btrim(label) <> '')
);

create unique index visit_options_unique on public.visit_options (kind, lower(label));
create index on public.visit_options (kind, sort_order);

create trigger visit_options_set_updated_at
  before update on public.visit_options
  for each row execute function public.set_updated_at();

-- A starting set, so the first check-in has something to choose. Every one of
-- these can be renamed, reordered or switched off without a migration.
insert into public.visit_options (kind, label, sort_order) values
  ('visit_type',     'Sales call',        1),
  ('visit_type',     'Delivery',          2),
  ('visit_type',     'Collection',        3),
  ('visit_type',     'Introduction',      4),
  ('visit_type',     'Complaint',         5),
  ('visit_status',   'Met the owner',     1),
  ('visit_status',   'Met a staff member',2),
  ('visit_status',   'Nobody there',      3),
  ('visit_status',   'Shop closed',       4),
  ('order_status',   'Ordered',           1),
  ('order_status',   'No order',          2),
  ('order_status',   'Will order later',  3),
  ('payment_status', 'Paid in full',      1),
  ('payment_status', 'Part paid',         2),
  ('payment_status', 'Nothing collected', 3),
  ('payment_status', 'Not due',           4);

alter table public.visit_options enable row level security;

-- Everybody reads them: a check-in screen needs them. Only settings changes them.
create policy visit_options_select on public.visit_options
  for select to authenticated using (true);
create policy visit_options_write on public.visit_options
  for all to authenticated
  using (app.can('settings', 'edit'))
  with check (app.can('settings', 'edit'));

revoke all on public.visit_options from authenticated, anon;
grant select, insert, update, delete on public.visit_options to authenticated;

-- How far is close enough ------------------------------------------------------------
alter table public.app_settings
  add column checkin_radius_m integer not null default 200
    constraint app_settings_radius_ck check (checkin_radius_m between 10 and 100000);

comment on column public.app_settings.checkin_radius_m is
  'What counts as being at the shop. Not enforced — a check-in further away '
  'than this is still recorded, and flagged.';

-- The visit --------------------------------------------------------------------------
create table public.visits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade
                  default auth.uid(),
  customer_id   uuid not null references public.customers (id) on delete restrict,

  checked_in_at  timestamptz not null default now(),
  checked_out_at timestamptz,

  -- Where the rep was, both times. Kept even when the shop has no pin, so a
  -- shop can be placed from where its visitors stood.
  in_latitude   numeric(9, 6),
  in_longitude  numeric(9, 6),
  out_latitude  numeric(9, 6),
  out_longitude numeric(9, 6),

  -- How far from the shop, and whether that was further than allowed. Null
  -- distance means unknown — the shop has no pin — which is not the same as far.
  distance_m    integer,
  out_of_range  boolean not null default false,
  -- What the radius was at the time. The setting will change; this visit was
  -- judged against the one in force when it happened.
  radius_m      integer,

  -- The record itself. Nothing is required at check-in: a rep walking into a
  -- shop does not yet know how it went.
  visit_type_id     uuid references public.visit_options (id) on delete set null,
  visit_status_id   uuid references public.visit_options (id) on delete set null,
  order_status_id   uuid references public.visit_options (id) on delete set null,
  payment_status_id uuid references public.visit_options (id) on delete set null,
  next_appointment  timestamptz,
  remarks           text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Leaving before arriving is not a visit.
  constraint visits_order_ck check (
    checked_out_at is null or checked_out_at >= checked_in_at
  ),
  constraint visits_distance_ck check (distance_m is null or distance_m >= 0),
  constraint visits_latlong_in_ck check (
    (in_latitude is null) = (in_longitude is null)
  ),
  constraint visits_latlong_out_ck check (
    (out_latitude is null) = (out_longitude is null)
  )
);

create index on public.visits (user_id, checked_in_at desc);
create index on public.visits (customer_id, checked_in_at desc);
create index on public.visits (checked_in_at desc);

-- One open visit at a time. A rep cannot be inside two shops, and an open visit
-- left behind would swallow the rest of the day's active hours.
create unique index visits_one_open_per_person
  on public.visits (user_id) where checked_out_at is null;

create trigger visits_set_updated_at
  before update on public.visits
  for each row execute function public.set_updated_at();

-- What cannot be changed -------------------------------------------------------------
-- The two timestamps, ever, by anybody; and everything else once the visit has
-- been closed for a day. Enforced here rather than in a form: a record of where
-- somebody was is worth nothing if it can be tidied up afterwards.
create function public.guard_visit_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.checked_in_at is distinct from old.checked_in_at then
    raise exception 'A check-in time cannot be changed' using errcode = 'check_violation';
  end if;

  -- Closing an open visit is the one write that sets it.
  if old.checked_out_at is not null
     and new.checked_out_at is distinct from old.checked_out_at then
    raise exception 'A check-out time cannot be changed' using errcode = 'check_violation';
  end if;

  if new.user_id is distinct from old.user_id
     or new.customer_id is distinct from old.customer_id then
    raise exception 'A visit cannot be moved to another person or shop'
      using errcode = 'check_violation';
  end if;

  -- Where somebody was is evidence too.
  if new.in_latitude is distinct from old.in_latitude
     or new.in_longitude is distinct from old.in_longitude
     or new.distance_m is distinct from old.distance_m
     or new.out_of_range is distinct from old.out_of_range then
    raise exception 'Where a check-in happened cannot be changed'
      using errcode = 'check_violation';
  end if;

  if old.checked_out_at is not null and old.checked_out_at < now() - interval '24 hours' then
    raise exception 'This visit closed more than a day ago and can no longer be edited'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger visits_guard_edit
  before update on public.visits
  for each row execute function public.guard_visit_edit();

alter table public.visits enable row level security;

-- The module model, keyed on the rep whose visit it is: own, sub or any, the
-- same shape as a sale order.
create policy visits_select on public.visits
  for select to authenticated using (app.can('visit', 'view', user_id));
create policy visits_insert on public.visits
  for insert to authenticated with check (app.can('visit', 'add', user_id));
create policy visits_update on public.visits
  for update to authenticated
  using (app.can('visit', 'edit', user_id))
  with check (app.can('visit', 'edit', user_id));
create policy visits_delete on public.visits
  for delete to authenticated using (app.can('visit', 'delete', user_id));

revoke all on public.visits from authenticated, anon;
grant select, insert, update, delete on public.visits to authenticated;

comment on table public.visits is
  'One call on one shop. The two timestamps are evidence and cannot be edited; '
  'everything else can, for a day after the visit closes.';

-- Checking in and out ----------------------------------------------------------------
-- In the database because the distance, the radius in force and the flag have
-- to be decided together, from the same numbers, at the same moment. A client
-- computing its own distance is a client that can report any distance it likes.
create function app.check_in(
  p_customer  uuid,
  p_latitude  numeric,
  p_longitude numeric
) returns public.visits
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me     uuid := auth.uid();
  v_radius integer;
  v_lat    numeric;
  v_lng    numeric;
  v_dist   integer;
  v_visit  public.visits;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  -- The unique index would refuse this anyway, with a message about an index.
  -- A rep who forgot to check out of the last shop needs to be told that.
  if exists (
    select 1 from public.visits
     where user_id = v_me and checked_out_at is null
  ) then
    raise exception 'You are still checked in somewhere. Check out first.'
      using errcode = 'unique_violation';
  end if;

  select checkin_radius_m into v_radius from public.app_settings limit 1;
  v_radius := coalesce(v_radius, 200);

  select c.latitude, c.longitude into v_lat, v_lng
    from public.customers c where c.id = p_customer;

  if not found then
    raise exception 'No such customer' using errcode = 'no_data_found';
  end if;

  -- Null when either side has no fix: unknown, which the report reads
  -- differently from far away.
  if v_lat is not null and p_latitude is not null then
    v_dist := round(app.metres_between(p_latitude, p_longitude, v_lat, v_lng));
  end if;

  insert into public.visits (
    customer_id, in_latitude, in_longitude, distance_m, radius_m, out_of_range
  ) values (
    p_customer, p_latitude, p_longitude, v_dist, v_radius,
    coalesce(v_dist > v_radius, false)
  )
  returning * into v_visit;

  return v_visit;
end;
$$;

-- Straight-line metres on a sphere. Cambodia is not large enough for the
-- ellipsoid to matter, and this is deciding whether somebody is outside a shop.
create function app.metres_between(
  p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric
) returns numeric
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    sin(radians(p_lat2 - p_lat1) / 2) ^ 2
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
    * sin(radians(p_lng2 - p_lng1) / 2) ^ 2
  )));
$$;

create function app.check_out(
  p_visit     uuid,
  p_latitude  numeric,
  p_longitude numeric
) returns public.visits
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_visit public.visits;
begin
  update public.visits
     set checked_out_at = now(),
         out_latitude = p_latitude,
         out_longitude = p_longitude
   where id = p_visit and checked_out_at is null
  returning * into v_visit;

  if v_visit.id is null then
    raise exception 'That visit is not open' using errcode = 'no_data_found';
  end if;

  return v_visit;
end;
$$;

-- The doorways -----------------------------------------------------------------------
create function public.check_in(p_customer uuid, p_latitude numeric, p_longitude numeric)
returns public.visits language sql security invoker set search_path = ''
as $$ select app.check_in(p_customer, p_latitude, p_longitude); $$;

create function public.check_out(p_visit uuid, p_latitude numeric, p_longitude numeric)
returns public.visits language sql security invoker set search_path = ''
as $$ select app.check_out(p_visit, p_latitude, p_longitude); $$;

revoke all on function app.check_in(uuid, numeric, numeric) from public, anon;
revoke all on function app.check_out(uuid, numeric, numeric) from public, anon;
revoke all on function public.check_in(uuid, numeric, numeric) from public, anon;
revoke all on function public.check_out(uuid, numeric, numeric) from public, anon;

grant execute on function app.metres_between(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function app.check_in(uuid, numeric, numeric) to authenticated;
grant execute on function app.check_out(uuid, numeric, numeric) to authenticated;
grant execute on function public.check_in(uuid, numeric, numeric) to authenticated;
grant execute on function public.check_out(uuid, numeric, numeric) to authenticated;

-- The module -------------------------------------------------------------------------
insert into public.modules (key, name, icon, href, sort_order, group_name) values
  ('visit', 'Visit', 'pin', 'visits', 10, 'Selling');

insert into public.view_modules (view_key, module_key, sort_order) values
  ('sales', 'visit', 3),
  ('admin', 'visit', 6);

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'visit', a.action::public.permission_action, 'any'::public.permission_scope
from public.roles r
cross join (values ('view'), ('add'), ('edit'), ('delete')) as a(action)
where r.key = 'system_admin';

-- A rep records their own and sees their own; the office sees the department's.
insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'visit', a.action::public.permission_action, a.scope::public.permission_scope
from public.roles r
cross join (values ('view', 'own'), ('add', 'own'), ('edit', 'own')) as a(action, scope)
where r.key = 'sales';

notify pgrst, 'reload schema';
