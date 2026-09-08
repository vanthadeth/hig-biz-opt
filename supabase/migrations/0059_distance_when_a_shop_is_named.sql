-- 0059_distance_when_a_shop_is_named
--
-- 0048 refused to compute a distance for a shop attached after an anonymous
-- check-in, on the reasoning that the shop "was not there to be measured
-- against" and that doing so would be inventing evidence. In practice this
-- left every check-in-then-name visit permanently distance-less, which reads
-- as a bug rather than the deliberate omission it was: a rep who checks in
-- at a prospect not yet on the books, then picks it from the shop list
-- moments later, was standing in exactly the spot `in_latitude`/`in_longitude`
-- already recorded -- there is a real distance to measure, it was just never
-- being asked for.
--
-- So the one moment a shop may attach to a visit (customer_id going from
-- null to a value -- still exactly once, still never swapped) is now also
-- the one moment its distance may be filled in. It is computed here, in the
-- trigger, from the position already on the row against the newly-chosen
-- shop's coordinates -- never from whatever a client sends, the same rule
-- every other distance in this table already follows. A shop with no pin
-- still gives no distance, same as at check-in; a check-in with no fix at
-- all still gives no distance either, because there is nothing on the row to
-- measure from.
--
-- WHAT STILL CANNOT CHANGE: in_latitude and in_longitude. That pair is the
-- one fact this migration leaves untouchable -- where the phone was at
-- check-in -- so the new distance is still honestly a distance from that
-- real moment, not from a made-up one.
--
-- AND A NEW LIMIT: a shop may only be chosen while the visit is still open.
-- The 24-hour window after check-out exists for what the visit *says* --
-- what kind of call it was, whether an order came of it -- not for where it
-- was to. Naming a shop is itself a claim about where the rep stood, and
-- that claim belongs at the same moment the position itself was recorded,
-- not sometime in the following day.
create or replace function public.guard_visit_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lat numeric;
  v_lng numeric;
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

  -- A visit that never named a shop may be given one. A visit that named one
  -- keeps it: swapping shops is falsification, and so is clearing it back to
  -- null in order to set a different one on the next write.
  if old.customer_id is not null
     and new.customer_id is distinct from old.customer_id then
    raise exception 'A visit cannot be moved to another shop'
      using errcode = 'check_violation';
  end if;

  -- Where the phone was at check-in is never rewritten, named shop or not.
  if new.in_latitude is distinct from old.in_latitude
     or new.in_longitude is distinct from old.in_longitude then
    raise exception 'Where a check-in happened cannot be changed'
      using errcode = 'check_violation';
  end if;

  if old.customer_id is null and new.customer_id is not null then
    if old.checked_out_at is not null then
      raise exception 'A shop may only be chosen before checking out'
        using errcode = 'check_violation';
    end if;

    -- Naming a shop, right now: compute the distance from that real
    -- check-in position to the shop just chosen, and stamp it in --
    -- overwriting anything the statement itself tried to send for these two
    -- columns, the same way check_in() never trusts a client-supplied figure.
    select c.latitude, c.longitude into v_lat, v_lng
      from public.customers c where c.id = new.customer_id;

    if v_lat is not null and old.in_latitude is not null then
      new.distance_m := round(app.metres_between(old.in_latitude, old.in_longitude, v_lat, v_lng));
    else
      new.distance_m := null;
    end if;
    new.out_of_range := coalesce(new.distance_m > old.radius_m, false);
  elsif new.distance_m is distinct from old.distance_m
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

notify pgrst, 'reload schema';
