-- 0049_cancelled_visits
--
-- A visit that should not have been.
--
-- The check-in is now one tap — it fires the moment the button is pressed, so
-- that the time and the position are the real ones rather than whatever the
-- clock said after somebody finished choosing a shop from a list. The price of
-- that is mistakes: a pocket tap, a wrong shop, a visit started and abandoned.
-- Without a way to void one, the only remedies are a bogus half-hour in
-- somebody's attendance or a delete, and a delete takes the evidence with it.
--
-- So a visit can be cancelled, and cancelling is an annotation rather than an
-- erasure. The row stays, with both its timestamps and its position; it simply
-- stops counting. A REASON IS REQUIRED, because "cancelled" with no reason is
-- indistinguishable from a second mistake, and the whole point is that the
-- next person to read this can tell the difference.
--
-- CANCELLING LIVES INSIDE THE SAME DAY-LONG WINDOW as every other correction.
-- The trigger already refuses any update to a visit closed more than 24 hours
-- ago, so this needs no rule of its own: what a visit says can be fixed for a
-- day, and after that it is the record — including whether it happened.
--
-- A CANCELLED VISIT STOPS BLOCKING THE NEXT CHECK-IN. The index that keeps a
-- rep from being in two places at once has to ignore cancelled ones, or a
-- mistaken check-in that was never closed would lock somebody out of the
-- feature for good.

alter table public.visits
  add column cancelled_at  timestamptz,
  add column cancel_reason text,

  -- Neither without the other. A cancellation with no reason is a shrug, and
  -- a reason with no cancellation is a note in the wrong field.
  add constraint visits_cancel_ck check (
    (cancelled_at is null) = (cancel_reason is null)
  ),
  add constraint visits_cancel_reason_ck check (
    cancel_reason is null or btrim(cancel_reason) <> ''
  );

comment on column public.visits.cancelled_at is
  'When the visit was voided. A cancelled visit keeps its times and its '
  'position and counts towards nothing.';
comment on column public.visits.cancel_reason is
  'Why. Required, because a cancellation nobody explained cannot be told '
  'apart from a second mistake.';

create index on public.visits (user_id, cancelled_at);

-- One open visit at a time, ignoring the ones that were called off. A
-- mistaken check-in never closed would otherwise lock a rep out for good.
drop index if exists public.visits_one_open_per_person;
create unique index visits_one_open_per_person
  on public.visits (user_id)
  where checked_out_at is null and cancelled_at is null;

-- Checking in ------------------------------------------------------------------------
-- The "still checked in somewhere" guard has to ignore cancelled visits for
-- the same reason the index does.
create or replace function app.check_in(
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

  if exists (
    select 1 from public.visits
     where user_id = v_me and checked_out_at is null and cancelled_at is null
  ) then
    raise exception 'You are still checked in somewhere. Check out first.'
      using errcode = 'unique_violation';
  end if;

  select checkin_radius_m into v_radius from public.app_settings limit 1;
  v_radius := coalesce(v_radius, 200);

  if p_customer is not null then
    select c.latitude, c.longitude into v_lat, v_lng
      from public.customers c where c.id = p_customer;

    if not found then
      raise exception 'No such customer' using errcode = 'no_data_found';
    end if;
  end if;

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

-- Checking out -----------------------------------------------------------------------
-- A cancelled visit is not open, whatever its check-out column says.
create or replace function app.check_out(
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
   where id = p_visit and checked_out_at is null and cancelled_at is null
  returning * into v_visit;

  if v_visit.id is null then
    raise exception 'That visit is not open' using errcode = 'no_data_found';
  end if;

  return v_visit;
end;
$$;

notify pgrst, 'reload schema';
