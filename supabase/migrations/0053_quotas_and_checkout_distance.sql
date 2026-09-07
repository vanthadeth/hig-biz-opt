-- 0053_quotas_and_checkout_distance
--
-- What a day is supposed to look like, and where the leaving happened.
--
-- THE QUOTA. Until now the day's figures were reported without anything to
-- read them against: "6h 50m working" is a number, not an answer. The three
-- the business actually manages by are how many shops were called on, how long
-- the day ran, and how much of that was inside a shop — so those three get a
-- daily and a weekly target, and the screens draw progress against them.
--
-- Weekly is stored rather than derived. Five times the daily target is a guess
-- about a six-day week, and a company that works Saturday mornings would have
-- to fight the arithmetic instead of typing a number.
--
-- Nulls mean "not managed". A business that cares about visit counts and not
-- about hours should not have to invent an hours target to say so, and a
-- progress bar against a target nobody set is a bar that always looks wrong.
--
-- THE OTHER END OF THE VISIT. The check-in has always recorded how far the rep
-- was from the shop; the check-out recorded nothing. That is the half that
-- catches the pattern worth catching — arriving at the shop and closing the
-- visit from the next district — and it was missing for no better reason than
-- that check-in came first.
--
-- It is measured and flagged exactly as the check-in is, against the radius in
-- force at the time, and it is evidence in the same way: the guard trigger
-- refuses to let either be edited afterwards.

alter table public.app_settings
  add column daily_visit_target    integer,
  add column daily_working_hours   numeric(4, 2),
  add column daily_active_hours    numeric(4, 2),
  add column weekly_visit_target   integer,
  add column weekly_working_hours  numeric(5, 2),
  add column weekly_active_hours   numeric(5, 2),

  -- A target of zero is not a target, and a negative one is a typo. Null is
  -- how you say "we do not manage this".
  add constraint app_settings_daily_visits_ck
    check (daily_visit_target is null or daily_visit_target between 1 and 100),
  add constraint app_settings_daily_working_ck
    check (daily_working_hours is null or daily_working_hours between 0.5 and 24),
  add constraint app_settings_daily_active_ck
    check (daily_active_hours is null or daily_active_hours between 0.5 and 24),
  add constraint app_settings_weekly_visits_ck
    check (weekly_visit_target is null or weekly_visit_target between 1 and 700),
  add constraint app_settings_weekly_working_ck
    check (weekly_working_hours is null or weekly_working_hours between 0.5 and 168),
  add constraint app_settings_weekly_active_ck
    check (weekly_active_hours is null or weekly_active_hours between 0.5 and 168),

  -- Active time is time inside shops and working time is the whole day, so one
  -- can never exceed the other. A pair that says otherwise is a typo somebody
  -- would spend an afternoon explaining.
  add constraint app_settings_daily_active_le_working_ck check (
    daily_active_hours is null or daily_working_hours is null
    or daily_active_hours <= daily_working_hours
  ),
  add constraint app_settings_weekly_active_le_working_ck check (
    weekly_active_hours is null or weekly_working_hours is null
    or weekly_active_hours <= weekly_working_hours
  );

comment on column public.app_settings.daily_visit_target is
  'Shops a rep is expected to call on in a day. Null means nobody manages it.';

-- Where the leaving happened -----------------------------------------------------------
alter table public.visits
  add column checkout_distance_m   integer,
  add column checkout_out_of_range boolean not null default false,

  add constraint visits_checkout_distance_ck
    check (checkout_distance_m is null or checkout_distance_m >= 0);

comment on column public.visits.checkout_distance_m is
  'How far from the shop the visit was closed. Null is unknown — no fix, or no '
  'pin on the shop — which the report reads differently from far away.';

-- Evidence, like the rest of it --------------------------------------------------------
create or replace function public.guard_visit_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.checked_in_at is distinct from old.checked_in_at then
    raise exception 'A check-in time cannot be changed' using errcode = 'check_violation';
  end if;

  if old.checked_out_at is not null
     and new.checked_out_at is distinct from old.checked_out_at then
    raise exception 'A check-out time cannot be changed' using errcode = 'check_violation';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'A visit cannot be moved to another person'
      using errcode = 'check_violation';
  end if;

  if old.customer_id is not null
     and new.customer_id is distinct from old.customer_id then
    raise exception 'A visit cannot be moved to another shop'
      using errcode = 'check_violation';
  end if;

  -- Where somebody was, at both ends. The check-out pair is exempt while the
  -- visit is still open, because closing it is the write that sets them.
  if new.in_latitude is distinct from old.in_latitude
     or new.in_longitude is distinct from old.in_longitude
     or new.distance_m is distinct from old.distance_m
     or new.out_of_range is distinct from old.out_of_range then
    raise exception 'Where a check-in happened cannot be changed'
      using errcode = 'check_violation';
  end if;

  if old.checked_out_at is not null
     and (new.out_latitude is distinct from old.out_latitude
       or new.out_longitude is distinct from old.out_longitude
       or new.checkout_distance_m is distinct from old.checkout_distance_m
       or new.checkout_out_of_range is distinct from old.checkout_out_of_range) then
    raise exception 'Where a check-out happened cannot be changed'
      using errcode = 'check_violation';
  end if;

  if old.checked_out_at is not null and old.checked_out_at < now() - interval '24 hours' then
    raise exception 'This visit closed more than a day ago and can no longer be edited'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Checking out, now measuring ----------------------------------------------------------
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
  v_visit  public.visits;
  v_radius integer;
  v_lat    numeric;
  v_lng    numeric;
  v_dist   integer;
begin
  select v.* into v_visit
    from public.visits v
   where v.id = p_visit and v.checked_out_at is null and v.cancelled_at is null;

  if v_visit.id is null then
    raise exception 'That visit is not open' using errcode = 'no_data_found';
  end if;

  -- The radius in force now, not the one the check-in was judged against: this
  -- is a second measurement at a second moment, and dressing it in the older
  -- number would make it look like part of the first.
  select checkin_radius_m into v_radius from public.app_settings limit 1;
  v_radius := coalesce(v_radius, 200);

  if v_visit.customer_id is not null then
    select c.latitude, c.longitude into v_lat, v_lng
      from public.customers c where c.id = v_visit.customer_id;
  end if;

  if v_lat is not null and p_latitude is not null then
    v_dist := round(app.metres_between(p_latitude, p_longitude, v_lat, v_lng));
  end if;

  update public.visits
     set checked_out_at = now(),
         out_latitude = p_latitude,
         out_longitude = p_longitude,
         checkout_distance_m = v_dist,
         checkout_out_of_range = coalesce(v_dist > v_radius, false)
   where id = p_visit and checked_out_at is null and cancelled_at is null
  returning * into v_visit;

  return v_visit;
end;
$$;

notify pgrst, 'reload schema';
