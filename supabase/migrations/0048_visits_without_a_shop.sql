-- 0048_visits_without_a_shop
--
-- A visit that is not to a shop.
--
-- The first version of this table insisted every check-in named a customer,
-- which was a guess about how the day goes and a wrong one. A rep stands
-- outside a shop that is not in the list yet. A rep spends the morning at the
-- warehouse, or at a prospect nobody has written down, or at a meeting. All of
-- that is working time, all of it belongs in the day's hours, and refusing to
-- record it does not make it stop happening — it makes the rep not check in,
-- which loses the whole day rather than one field of it.
--
-- So `customer_id` becomes optional. Null means "somewhere else", which is a
-- different thing from a shop that has since been deleted, and the screens say
-- so in different words.
--
-- THE SHOP CAN BE FILLED IN, ONCE, AND NEVER SWAPPED. Checking in at a
-- prospect and adding them as a customer an hour later is the ordinary case,
-- and a visit that could never gain a shop would strand it. But moving a visit
-- from one shop to another is falsification, and so is clearing one back to
-- null and then setting it again — so null may become a shop, and a shop may
-- become nothing else. The 24-hour correction window still applies on top.
--
-- WHAT IT CANNOT DO IS MANUFACTURE A DISTANCE. The distance is what was
-- measured between the phone and the shop at the moment of the check-in. A
-- shop attached afterwards was not there to be measured against, so the
-- distance stays null and the screens say why. Computing it now from the
-- shop's present coordinates would be inventing evidence.

alter table public.visits alter column customer_id drop not null;

comment on column public.visits.customer_id is
  'The shop, when the visit was to one. Null is a visit somewhere else — a '
  'prospect not yet on the books, the warehouse, a meeting — which still '
  'counts towards the day. It may be filled in later but never swapped.';

-- What cannot be changed, restated ---------------------------------------------------
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

  -- Closing an open visit is the one write that sets it.
  if old.checked_out_at is not null
     and new.checked_out_at is distinct from old.checked_out_at then
    raise exception 'A check-out time cannot be changed' using errcode = 'check_violation';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'A visit cannot be moved to another person'
      using errcode = 'check_violation';
  end if;

  -- A visit that never named a shop may be given one. A visit that named one
  -- keeps it: swapping shops is falsification, and so is clearing it back to
  -- null in order to set a different one on the next write.
  if old.customer_id is not null
     and new.customer_id is distinct from old.customer_id then
    raise exception 'A visit cannot be moved to another shop'
      using errcode = 'check_violation';
  end if;

  -- Where somebody was is evidence too. Note what is absent: attaching a shop
  -- to a visit does not recompute the distance, and cannot, because this
  -- refuses to let it be written. The distance was measured at the check-in or
  -- it was never measured at all.
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

-- Checking in ------------------------------------------------------------------------
-- Same signature, so nothing that calls it has to change; a null customer is
-- now an answer rather than a mistake.
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

  -- A named shop must exist. No shop at all is a different answer: the rep is
  -- somewhere, and there is nothing to measure the distance against.
  if p_customer is not null then
    select c.latitude, c.longitude into v_lat, v_lng
      from public.customers c where c.id = p_customer;

    if not found then
      raise exception 'No such customer' using errcode = 'no_data_found';
    end if;
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

notify pgrst, 'reload schema';
