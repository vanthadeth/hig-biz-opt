-- visits.test.sql
--
-- Checking in at a shop, checking out again, and what the day adds up to.
--
-- Two questions decide whether this feature is worth anything.
--
-- The first is whether the timestamps are evidence. A visit record that can be
-- tidied up afterwards proves nothing about where anybody was, so the tests
-- below try to move a check-in time, move a check-out time, move a visit onto
-- another rep, and edit a visit that closed two days ago — every one of them
-- as the administrator, because a rule only the ordinary user obeys is not a
-- rule. Corrections to what the visit *says* stay open for a day, because
-- people write "no order" and then get one an hour later.
--
-- The second is whether a visit that is not to a shop is still a visit. A rep
-- standing outside a prospect nobody has written down, or a morning at the
-- warehouse, is working time; refusing to record it does not stop it happening,
-- it stops the check-in. So the shop is optional — and may be filled in once,
-- afterwards, and never swapped, because "we went to A" becoming "we went to B"
-- is falsification while "we went somewhere, and it was A" is not.
--
-- The third is whether a visit made by mistake can be undone without lying.
-- The check-in now fires on one tap, so that the time and the position are the
-- real ones rather than whatever the clock said after somebody finished
-- scrolling a list of shops — and the price of that is pocket taps. Cancelling
-- is the remedy, and it is an annotation rather than a delete: the row keeps
-- both its timestamps and its position and simply stops counting. A reason is
-- required, because "cancelled" on its own cannot be told apart from a second
-- mistake. Most importantly a cancelled visit stops blocking the next
-- check-in, or one mis-tap would lock a rep out of the feature for good.
-- And because cancelling is itself a tap somebody can get wrong, it comes
-- back off again: clearing the moment and the reason together puts the visit
-- back, while clearing either one alone leaves half a state and is refused.
--
-- The fourth is whether both ends of the visit are measured. The check-in has
-- always recorded how far the rep was from the shop; the check-out recorded
-- nothing, which left the pattern most worth catching invisible — arriving at
-- the shop and closing the visit from the next district.
--
-- The fifth is whether the distance is honest. It is recorded, never
-- enforced: a check-in eleven kilometres away is accepted and flagged, and a
-- shop with no pin gives a null distance — unknown, which the report has to
-- read differently from far away — while still keeping the rep's own position,
-- so the shop can be pinned later from where its visitors stood.
--
-- The sixth is whether a day has a shape to meet. Visits, working hours and
-- active hours each get a daily and a weekly target, all of them unset until
-- somebody decides one, because a made-up quota is worse than none. Active
-- time is time inside shops and the working day contains it, so a pair that
-- says otherwise is refused rather than displayed as an impossible bar.
--
-- Everything happens inside one transaction that is deliberately rolled back,
-- so a run leaves no trace.
--
--     psql "$DATABASE_URL" -f supabase/tests/visits.test.sql
--
-- Success looks like an error, because the rollback is what forces it:
--
--     ERROR:  VISITS OK - 103 assertions passed (rls: ran)
--
-- Anything else is a real failure and names the assertion that broke.

create or replace function pg_temp.bump() returns void language plpgsql as $f$
begin
  perform set_config('higtest.checks',
    (coalesce(current_setting('higtest.checks', true), '0')::int + 1)::text, false);
end;
$f$;

create or replace function pg_temp.eq(p_label text, p_actual text, p_expected text)
returns void language plpgsql as $f$
begin
  perform pg_temp.bump();
  if p_actual is distinct from p_expected then
    raise exception 'FAILED: % -- expected %, got %',
      p_label, coalesce(p_expected, 'null'), coalesce(p_actual, 'null');
  end if;
end;
$f$;

create or replace function pg_temp.ok(p_label text, p_actual boolean)
returns void language plpgsql as $f$
begin
  perform pg_temp.bump();
  if p_actual is distinct from true then
    raise exception 'FAILED: % -- expected true, got %', p_label, coalesce(p_actual::text, 'null');
  end if;
end;
$f$;

create or replace function pg_temp.rejects(p_label text, p_stmt text)
returns void language plpgsql as $f$
begin
  perform pg_temp.bump();
  begin
    execute p_stmt;
  exception
    when check_violation or not_null_violation or foreign_key_violation
      or unique_violation or raise_exception or no_data_found
      or insufficient_privilege then
      return;
  end;
  raise exception 'FAILED: % -- statement was accepted but should have been refused', p_label;
end;
$f$;

create or replace function pg_temp.act_as(p_user uuid)
returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end;
$f$;

create or replace function pg_temp.new_user(
  p_id uuid, p_email text, p_name text, p_role_key text
) returns void language plpgsql as $f$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name, 'role_key', p_role_key),
    now(), now(), '', '', '', ''
  );
end;
$f$;


do $$
declare
  v_sa    uuid := '00000000-0000-4000-8000-0000000f0001';  -- super admin
  v_rep   uuid := '00000000-0000-4000-8000-0000000f0002';  -- the rep who calls
  v_rep2  uuid := '00000000-0000-4000-8000-0000000f0003';  -- a colleague
  -- A shop on Norodom Boulevard, and the rep standing about a hundred metres
  -- up the road from it. Real coordinates, so the haversine is checked against
  -- a distance somebody could pace out.
  v_shop_lat  numeric := 11.556400;
  v_shop_lng  numeric := 104.928200;
  v_near_lat  numeric := 11.557300;   -- ~100 m north
  v_near_lng  numeric := 104.928200;
  v_cus   uuid;   -- the pinned shop
  v_blind uuid;   -- a shop nobody has pinned yet
  v_far   uuid;   -- a shop out at the airport
  v_type  uuid;
  v_ostat uuid;
  v_visit public.visits;
  v_old   uuid;   -- a visit closed two days ago
  v_none  uuid;   -- a visit to nowhere in particular
  v_two   public.visits;  -- the one made after a mistake was called off
  v_mine  integer;        -- how many of the rep's visits actually exist
  v_rls   text := 'skipped (cannot assume the authenticated role)';
begin
  perform set_config('higtest.checks', '0', false);

  perform pg_temp.new_user(v_sa,   'vis.sa@example.test',   'Vis Admin', 'system_admin');
  perform pg_temp.new_user(v_rep,  'vis.rep@example.test',  'Vis Rep',   'sales');
  perform pg_temp.new_user(v_rep2, 'vis.rep2@example.test', 'Vis Rep 2', 'sales');
  update public.users set is_super_admin = true where id = v_sa;

  insert into public.customers (shop_name, owner_id, latitude, longitude)
    values ('Vis Shop', v_rep, v_shop_lat, v_shop_lng) returning id into v_cus;
  insert into public.customers (shop_name, owner_id)
    values ('Vis Unpinned', v_rep) returning id into v_blind;
  insert into public.customers (shop_name, owner_id, latitude, longitude)
    values ('Vis Far', v_rep, 11.546600, 104.844100) returning id into v_far;

  ----------------------------------------------------------------------------
  -- The dropdowns
  --
  -- Rows, not enum labels, so the business can rename its own words. What
  -- matters is that all four kinds arrive with something in them: a check-in
  -- screen with an empty dropdown is a check-in screen nobody fills in.
  ----------------------------------------------------------------------------
  perform pg_temp.eq('every kind of dropdown has options',
    (select count(distinct kind)::text from public.visit_options where active), '4');
  perform pg_temp.rejects('an option needs a label',
    'insert into public.visit_options (kind, label) values (''visit_type'', ''   '')');
  perform pg_temp.rejects('and the same word is not offered twice',
    'insert into public.visit_options (kind, label) values (''visit_type'', ''sales call'')');

  select id into v_type  from public.visit_options where kind = 'visit_type'   and label = 'Sales call';
  select id into v_ostat from public.visit_options where kind = 'order_status' and label = 'Ordered';

  ----------------------------------------------------------------------------
  -- How far is close enough
  ----------------------------------------------------------------------------
  -- What the radius *starts* at is the column's default; what it *is* is a
  -- business setting somebody may have moved since, so the rest of this file
  -- pins it rather than reading it and hoping.
  perform pg_temp.eq('the radius starts at two hundred metres',
    (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'app_settings'
        and column_name = 'checkin_radius_m'), '200');
  update public.app_settings set checkin_radius_m = 200;
  perform pg_temp.rejects('a radius of one metre is not a setting, it is a bug',
    'update public.app_settings set checkin_radius_m = 1');
  perform pg_temp.rejects('nor is one that spans the country',
    'update public.app_settings set checkin_radius_m = 500000');

  -- The maths itself, against a distance that can be checked by hand: a
  -- hundredth of a degree of latitude is 1111 m, everywhere.
  perform pg_temp.ok('a hundredth of a degree north is about 1111 metres',
    abs(app.metres_between(11.5, 104.9, 11.51, 104.9) - 1111) < 5);
  perform pg_temp.eq('and standing still is no distance at all',
    round(app.metres_between(11.5, 104.9, 11.5, 104.9))::text, '0');

  ----------------------------------------------------------------------------
  -- A call, from the rep's own hands
  ----------------------------------------------------------------------------
  begin
    execute 'set local role authenticated';
    perform pg_temp.act_as(v_rep);
    v_rls := 'ran';

    v_visit := public.check_in(v_cus, v_near_lat, v_near_lng);

    perform pg_temp.eq('the visit belongs to whoever checked in',
      v_visit.user_id::text, v_rep::text);
    perform pg_temp.eq('and to the shop they are standing at',
      v_visit.customer_id::text, v_cus::text);
    perform pg_temp.ok('it opens', v_visit.checked_out_at is null);
    perform pg_temp.ok('a hundred metres up the road is about a hundred metres',
      v_visit.distance_m between 80 and 120);
    perform pg_temp.eq('which is inside the radius',
      v_visit.out_of_range::text, 'false');
    perform pg_temp.eq('and the radius it was judged against is written down',
      v_visit.radius_m::text, '200');
    perform pg_temp.eq('with the rep''s own position kept',
      v_visit.in_latitude::text, v_near_lat::text);

    -- A rep cannot be inside two shops. Told in words, not by an index name.
    perform pg_temp.rejects('a second check-in is refused while one is open',
      format('select public.check_in(%L, %s, %s)', v_far, v_near_lat, v_near_lng));

    ----------------------------------------------------------------------
    -- What the visit says can be written while it is open
    ----------------------------------------------------------------------
    update public.visits
       set visit_type_id = v_type, order_status_id = v_ostat,
           remarks = 'Owner out, spoke to the son',
           next_appointment = now() + interval '7 days'
     where id = v_visit.id;
    perform pg_temp.eq('the record is written as the call goes on',
      (select remarks from public.visits where id = v_visit.id),
      'Owner out, spoke to the son');

    -- But not what it proves.
    perform pg_temp.rejects('a check-in time cannot be moved',
      format('update public.visits set checked_in_at = now() - interval ''3 hours''
              where id = %L', v_visit.id));
    perform pg_temp.rejects('nor the distance it was checked in at',
      format('update public.visits set distance_m = 5 where id = %L', v_visit.id));
    perform pg_temp.rejects('nor the flag that came of it',
      format('update public.visits set out_of_range = true where id = %L', v_visit.id));
    perform pg_temp.rejects('nor where the rep was standing',
      format('update public.visits set in_latitude = 11.5 where id = %L', v_visit.id));
    perform pg_temp.rejects('and a visit cannot be handed to somebody else',
      format('update public.visits set user_id = %L where id = %L', v_rep2, v_visit.id));
    perform pg_temp.rejects('nor moved onto another shop',
      format('update public.visits set customer_id = %L where id = %L', v_far, v_visit.id));

    ----------------------------------------------------------------------
    -- Checking out
    ----------------------------------------------------------------------
    v_visit := public.check_out(v_visit.id, v_near_lat, v_near_lng);
    perform pg_temp.ok('checking out closes the visit', v_visit.checked_out_at is not null);
    perform pg_temp.ok('after the check-in, not before',
      v_visit.checked_out_at >= v_visit.checked_in_at);
    perform pg_temp.eq('and keeps where the rep left from',
      v_visit.out_latitude::text, v_near_lat::text);

    perform pg_temp.rejects('a closed visit cannot be closed again',
      format('select public.check_out(%L, %s, %s)', v_visit.id, v_near_lat, v_near_lng));
    perform pg_temp.rejects('and a check-out time cannot be moved either',
      format('update public.visits set checked_out_at = now() + interval ''1 hour''
              where id = %L', v_visit.id));

    -- The correction the day afterwards: the thing this is all for.
    update public.visits set remarks = 'They rang back and ordered'
     where id = v_visit.id;
    perform pg_temp.eq('a closed visit can still be corrected the same day',
      (select remarks from public.visits where id = v_visit.id),
      'They rang back and ordered');

    ----------------------------------------------------------------------
    -- The two shops that test the distance rather than the visit
    ----------------------------------------------------------------------
    v_visit := public.check_in(v_far, v_near_lat, v_near_lng);
    perform pg_temp.ok('the airport is a long way from Norodom Boulevard',
      v_visit.distance_m > 9000);
    perform pg_temp.eq('so the visit is flagged, not refused',
      v_visit.out_of_range::text, 'true');
    perform pg_temp.ok('and it is a visit all the same', v_visit.id is not null);
    perform pg_temp.ok('closing it',
      (public.check_out(v_visit.id, null, null)).id is not null);

    v_visit := public.check_in(v_blind, v_near_lat, v_near_lng);
    perform pg_temp.ok('an unpinned shop gives no distance', v_visit.distance_m is null);
    perform pg_temp.eq('which is unknown, not out of range',
      v_visit.out_of_range::text, 'false');
    perform pg_temp.eq('and the rep''s position is kept, so the shop can be pinned',
      v_visit.in_longitude::text, v_near_lng::text);
    perform pg_temp.ok('closing it too',
      (public.check_out(v_visit.id, v_near_lat, v_near_lng)).id is not null);

    perform pg_temp.rejects('checking in at a shop that does not exist',
      format('select public.check_in(%L, %s, %s)',
        '00000000-0000-4000-8000-0000000f9999'::uuid, v_near_lat, v_near_lng));

    execute 'reset role';
  exception when insufficient_privilege then
    execute 'reset role';
  end;

  ----------------------------------------------------------------------------
  -- Somewhere that is not a shop
  --
  -- The whole point of making the customer optional: the alternative to a
  -- visit with no shop on it is no visit at all, and a day's hours short.
  ----------------------------------------------------------------------------
  if v_rls = 'ran' then
    begin
      execute 'set local role authenticated';
      perform pg_temp.act_as(v_rep);

      v_visit := public.check_in(null, v_near_lat, v_near_lng);
      perform pg_temp.ok('a rep can check in without naming a shop',
        v_visit.id is not null);
      perform pg_temp.ok('and the visit names no shop',
        v_visit.customer_id is null);
      perform pg_temp.ok('with no distance, there being nothing to measure to',
        v_visit.distance_m is null);
      perform pg_temp.eq('which is unknown, not out of range',
        v_visit.out_of_range::text, 'false');
      perform pg_temp.eq('and the rep''s own position is kept all the same',
        v_visit.in_latitude::text, v_near_lat::text);

      -- The ordinary case: checked in at a prospect, who becomes a customer
      -- an hour later.
      update public.visits set customer_id = v_cus where id = v_visit.id;
      perform pg_temp.eq('a shop can be filled in afterwards',
        (select customer_id::text from public.visits where id = v_visit.id),
        v_cus::text);

      -- But not swapped, and not cleared in order to swap on the next write.
      perform pg_temp.rejects('and then never moved to a different shop',
        format('update public.visits set customer_id = %L where id = %L', v_far, v_visit.id));
      perform pg_temp.rejects('nor cleared back to nothing',
        format('update public.visits set customer_id = null where id = %L', v_visit.id));

      -- Attaching a shop cannot manufacture a distance that was never measured.
      perform pg_temp.ok('and attaching it does not invent a distance',
        (select distance_m is null from public.visits where id = v_visit.id));
      perform pg_temp.rejects('which cannot be written in by hand either',
        format('update public.visits set distance_m = 10 where id = %L', v_visit.id));

      perform pg_temp.ok('closing the shopless visit',
        (public.check_out(v_visit.id, v_near_lat, v_near_lng)).id is not null);

      execute 'reset role';
    exception when insufficient_privilege then
      execute 'reset role';
    end;
  end if;

  -- A visit with no shop is still one open visit: the rule that a rep cannot
  -- be in two places holds whether or not either place has a name.
  insert into public.visits (user_id, customer_id) values (v_rep, null)
    returning id into v_none;
  perform pg_temp.rejects('one open visit per person, shop or no shop',
    format('insert into public.visits (user_id, customer_id) values (%L, null)', v_rep));
  delete from public.visits where id = v_none;

  ----------------------------------------------------------------------------
  -- A visit that should not have been
  ----------------------------------------------------------------------------
  perform pg_temp.rejects('a cancellation with no reason is a shrug',
    format('insert into public.visits (user_id, customer_id, cancelled_at)
            values (%L, %L, now())', v_rep, v_cus));
  perform pg_temp.rejects('and a reason with no cancellation is the wrong field',
    format('insert into public.visits (user_id, customer_id, cancel_reason)
            values (%L, %L, ''oops'')', v_rep, v_cus));
  perform pg_temp.rejects('nor is whitespace a reason',
    format('insert into public.visits (user_id, customer_id, cancelled_at, cancel_reason)
            values (%L, %L, now(), ''   '')', v_rep, v_cus));

  if v_rls = 'ran' then
    begin
      execute 'set local role authenticated';
      perform pg_temp.act_as(v_rep);

      v_visit := public.check_in(v_cus, v_near_lat, v_near_lng);
      perform pg_temp.rejects('a second check-in is refused while one is open',
        format('select public.check_in(%L, %s, %s)', v_far, v_near_lat, v_near_lng));

      update public.visits
         set cancelled_at = now(), cancel_reason = 'Tapped by mistake'
       where id = v_visit.id;
      perform pg_temp.eq('a visit can be called off while it is open',
        (select cancel_reason from public.visits where id = v_visit.id),
        'Tapped by mistake');

      -- The reason this exists at all: one mis-tap must not lock somebody out
      -- of the feature for the rest of the day.
      v_two := public.check_in(v_far, v_near_lat, v_near_lng);
      perform pg_temp.ok('and checking in again is no longer blocked by it',
        v_two.id is not null);

      perform pg_temp.rejects('a cancelled visit cannot be checked out of',
        format('select public.check_out(%L, null, null)', v_visit.id));

      -- The row survives entire: that is what makes this an annotation rather
      -- than a delete, and what a delete would have taken with it.
      perform pg_temp.ok('the cancelled visit keeps its check-in time',
        (select checked_in_at is not null from public.visits where id = v_visit.id));
      perform pg_temp.ok('and where it happened',
        (select in_latitude is not null from public.visits where id = v_visit.id));
      perform pg_temp.ok('and the distance it was measured at',
        (select distance_m is not null from public.visits where id = v_visit.id));

      -- A time that is genuinely different. `now()` inside a transaction is the
      -- transaction's own clock, so setting it on a row created in the same
      -- transaction changes nothing, and the trigger rightly allows it.
      perform pg_temp.rejects('and its check-in time still cannot be moved',
        format('update public.visits set checked_in_at = now() - interval ''3 hours''
                where id = %L', v_visit.id));

      perform pg_temp.ok('closing the second visit',
        (public.check_out(v_two.id, v_near_lat, v_near_lng)).id is not null);

      update public.visits
         set cancelled_at = now(), cancel_reason = 'Wrong shop'
       where id = v_two.id;
      perform pg_temp.eq('a closed visit can be called off the same day',
        (select cancel_reason from public.visits where id = v_two.id), 'Wrong shop');

      execute 'reset role';
    exception when insufficient_privilege then
      execute 'reset role';
    end;
  end if;

  -- Cancelled visits sit open without blocking anything, which is what the
  -- partial index is for.
  insert into public.visits (user_id, customer_id, cancelled_at, cancel_reason)
    values (v_rep, v_cus, now(), 'one'), (v_rep, v_far, now(), 'two');
  perform pg_temp.eq('any number of cancelled visits may sit open at once',
    (select count(*)::text from public.visits
      where user_id = v_rep and cancelled_at is not null and checked_out_at is null), '3');

  ----------------------------------------------------------------------------
  -- Where the leaving happened
  --
  -- The half that catches somebody arriving at the shop and closing the visit
  -- from somewhere else. Measured against the radius in force at the moment of
  -- the check-out, not the one the check-in was judged against: it is a second
  -- measurement at a second moment, and dressing it in the older number would
  -- make it look like part of the first.
  ----------------------------------------------------------------------------
  insert into public.visits (user_id, customer_id, in_latitude, in_longitude,
                             distance_m, radius_m)
    values (v_rep, v_cus, v_near_lat, v_near_lng, 100, 200) returning * into v_visit;
  perform pg_temp.ok('an open visit has measured no check-out yet',
    v_visit.checkout_distance_m is null and not v_visit.checkout_out_of_range);

  v_visit := app.check_out(v_visit.id, 11.546600, 104.844100);
  perform pg_temp.ok('closing from the airport is measured',
    v_visit.checkout_distance_m > 9000);
  perform pg_temp.eq('and flagged', v_visit.checkout_out_of_range::text, 'true');
  perform pg_temp.eq('while the check-in it began with is untouched',
    v_visit.distance_m::text, '100');
  perform pg_temp.eq('and that end stays in range',
    v_visit.out_of_range::text, 'false');

  -- Evidence, on the same terms as the other end.
  perform pg_temp.rejects('a check-out distance cannot be edited afterwards',
    format('update public.visits set checkout_distance_m = 5 where id = %L', v_visit.id));
  perform pg_temp.rejects('nor the flag that came of it',
    format('update public.visits set checkout_out_of_range = false where id = %L', v_visit.id));
  perform pg_temp.rejects('nor where the rep was when they left',
    format('update public.visits set out_latitude = 11.5 where id = %L', v_visit.id));

  -- Unknown at this end too, for the same two reasons as at the other.
  insert into public.visits (user_id, customer_id) values (v_rep, v_blind)
    returning * into v_visit;
  v_visit := app.check_out(v_visit.id, v_near_lat, v_near_lng);
  perform pg_temp.ok('an unpinned shop gives no check-out distance either',
    v_visit.checkout_distance_m is null);
  perform pg_temp.eq('which is unknown, not out of range',
    v_visit.checkout_out_of_range::text, 'false');

  insert into public.visits (user_id, customer_id) values (v_rep, v_cus)
    returning * into v_visit;
  v_visit := app.check_out(v_visit.id, null, null);
  perform pg_temp.ok('nor does a check-out with no fix at all',
    v_visit.checkout_distance_m is null);

  ----------------------------------------------------------------------------
  -- What a day is supposed to look like
  ----------------------------------------------------------------------------
  -- Unset is the shipped state, which is the column default rather than
  -- whatever the one row holds today.
  perform pg_temp.ok('a quota starts unset, because nobody has decided one yet',
    (select count(*) = 6 from information_schema.columns
      where table_schema = 'public' and table_name = 'app_settings'
        and column_name in ('daily_visit_target', 'daily_working_hours',
                            'daily_active_hours', 'weekly_visit_target',
                            'weekly_working_hours', 'weekly_active_hours')
        and column_default is null));
  update public.app_settings
     set daily_visit_target = 8, daily_working_hours = 8.5, daily_active_hours = 4,
         weekly_visit_target = 44, weekly_working_hours = 48, weekly_active_hours = 22;
  perform pg_temp.eq('and can be set',
    (select daily_visit_target::text from public.app_settings), '8');
  perform pg_temp.rejects('a target of nothing is not a target',
    'update public.app_settings set daily_visit_target = 0');
  perform pg_temp.rejects('nor is a day longer than a day',
    'update public.app_settings set daily_working_hours = 25');
  -- Active time is time inside shops; the working day contains it. A pair that
  -- says otherwise is a typo somebody would spend an afternoon explaining.
  perform pg_temp.rejects('active hours may not exceed working hours',
    'update public.app_settings set daily_active_hours = 9');
  perform pg_temp.rejects('and the same holds for the week',
    'update public.app_settings set weekly_active_hours = 60');

  ----------------------------------------------------------------------------
  -- Changing your mind about calling one off
  ----------------------------------------------------------------------------
  insert into public.visits (user_id, customer_id) values (v_rep, v_cus)
    returning * into v_visit;
  update public.visits set cancelled_at = now(), cancel_reason = 'Tapped by mistake'
   where id = v_visit.id;

  -- Half a cancellation is not a state.
  perform pg_temp.rejects('a reason cannot be cleared on its own',
    format('update public.visits set cancel_reason = null where id = %L', v_visit.id));
  perform pg_temp.rejects('nor the moment, leaving a reason behind',
    format('update public.visits set cancelled_at = null where id = %L', v_visit.id));

  update public.visits set cancelled_at = null, cancel_reason = null where id = v_visit.id;
  perform pg_temp.ok('but both together put the visit back',
    (select cancelled_at is null and cancel_reason is null
       from public.visits where id = v_visit.id));
  perform pg_temp.ok('with its times untouched by the round trip',
    (select checked_in_at is not null from public.visits where id = v_visit.id));
  perform pg_temp.ok('closing it again',
    (public.check_out(v_visit.id, v_near_lat, v_near_lng)).id is not null);

  ----------------------------------------------------------------------------
  -- Two days later
  --
  -- The trigger is switched off to age a visit, because it refuses exactly the
  -- write that would age it — which is the point. Everything after this is the
  -- rule biting on a visit that genuinely closed two days ago.
  ----------------------------------------------------------------------------
  insert into public.visits (user_id, customer_id, remarks)
    values (v_rep, v_cus, 'Last week') returning id into v_old;
  alter table public.visits disable trigger visits_guard_edit;
  update public.visits
     set checked_in_at  = now() - interval '49 hours',
         checked_out_at = now() - interval '48 hours'
   where id = v_old;
  alter table public.visits enable trigger visits_guard_edit;

  perform pg_temp.rejects('a visit closed two days ago is closed for good',
    format('update public.visits set remarks = ''tidied up'' where id = %L', v_old));
  perform pg_temp.rejects('and can no longer be called off either',
    format('update public.visits set cancelled_at = now(), cancel_reason = ''late''
            where id = %L', v_old));
  perform pg_temp.eq('and still says what it said',
    (select remarks from public.visits where id = v_old), 'Last week');

  ----------------------------------------------------------------------------
  -- Shapes the table refuses outright
  ----------------------------------------------------------------------------
  perform pg_temp.rejects('leaving before arriving is not a visit',
    format('insert into public.visits (user_id, customer_id, checked_in_at, checked_out_at)
            values (%L, %L, now(), now() - interval ''1 hour'')', v_rep, v_cus));
  perform pg_temp.rejects('half a position is not a position',
    format('insert into public.visits (user_id, customer_id, in_latitude)
            values (%L, %L, 11.5)', v_rep, v_cus));
  perform pg_temp.rejects('nor is a negative distance',
    format('insert into public.visits (user_id, customer_id, distance_m)
            values (%L, %L, -1)', v_rep, v_cus));

  -- Two open visits for one rep, from the table's own side rather than through
  -- the function that explains it politely.
  insert into public.visits (user_id, customer_id) values (v_rep, v_cus);
  perform pg_temp.rejects('one open visit per person, index or no function',
    format('insert into public.visits (user_id, customer_id) values (%L, %L)', v_rep, v_far));
  delete from public.visits
   where user_id = v_rep and checked_out_at is null and cancelled_at is null;

  -- A shop somebody has visited cannot simply vanish; the visit would be to
  -- nowhere, and where the rep was is the record.
  perform pg_temp.rejects('a shop with visits may not be deleted',
    format('delete from public.customers where id = %L', v_cus));

  ----------------------------------------------------------------------------
  -- Whose visits they are
  --
  -- The sales role holds view, add and edit at 'own' — a rep records their own
  -- calls and reads their own day. A colleague is not the office.
  ----------------------------------------------------------------------------
  select count(*) into v_mine from public.visits where user_id = v_rep;

  if v_rls = 'ran' then
    begin
      execute 'set local role authenticated';

      perform pg_temp.act_as(v_rep);
      -- Against what the administrator can see, rather than a number written
      -- down here: the count is incidental to everything else this file does,
      -- and pinning it made unrelated additions above break this assertion.
      -- What is being tested is that the rep sees all of their own, not some.
      perform pg_temp.eq('the rep sees every call they made',
        (select count(*)::text from public.visits where user_id = v_rep), v_mine::text);

      perform pg_temp.act_as(v_rep2);
      perform pg_temp.eq('a colleague sees none of them',
        (select count(*)::text from public.visits where user_id = v_rep), '0');
      perform pg_temp.rejects('and cannot record one on their behalf',
        format('insert into public.visits (user_id, customer_id) values (%L, %L)', v_rep, v_cus));

      perform pg_temp.act_as(v_sa);
      perform pg_temp.ok('an administrator sees the lot',
        (select count(*) from public.visits where user_id = v_rep) >= 3);

      -- A refused delete matches no rows and raises nothing at all, so what is
      -- left afterwards is the only proof it was refused.
      perform pg_temp.act_as(v_rep);
      delete from public.visits where id = v_old;
      perform pg_temp.act_as(v_sa);
      perform pg_temp.eq('a rep may not delete a visit',
        (select count(*)::text from public.visits where id = v_old), '1');

      -- Nor may they rename the words the business chose.
      perform pg_temp.act_as(v_rep);
      update public.visit_options set label = 'Whatever' where id = v_type;
      perform pg_temp.act_as(v_sa);
      perform pg_temp.eq('nor rename a dropdown option',
        (select label from public.visit_options where id = v_type), 'Sales call');

      execute 'reset role';
    exception when insufficient_privilege then
      execute 'reset role';
    end;
  end if;

  ----------------------------------------------------------------------------
  -- The module
  ----------------------------------------------------------------------------
  perform pg_temp.eq('visits are a module',
    (select count(*)::text from public.modules where key = 'visit'), '1');
  perform pg_temp.eq('on the sales view and the admin one',
    (select count(*)::text from public.view_modules where module_key = 'visit'), '2');
  perform pg_temp.eq('an administrator may do anything with them',
    (select count(*)::text from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
     where r.key = 'system_admin' and rp.module_key = 'visit' and rp.scope = 'any'), '4');

  raise exception 'VISITS OK - % assertions passed (rls: %)',
    current_setting('higtest.checks'), v_rls;
end;
$$;
