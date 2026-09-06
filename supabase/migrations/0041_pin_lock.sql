-- 0041_pin_lock
--
-- A four-digit PIN, so the phone can be handed to a customer.
--
-- What this is for, precisely: a rep opens the catalogue, gives their phone to
-- the shopkeeper, and the shopkeeper browses and picks things. While that is
-- happening the rest of the app — other customers' accounts, prices, the
-- employee list — must not be one back-swipe away. The PIN is what ends that
-- state.
--
-- What it is not: a defence against somebody who owns the device and means
-- harm. The session in that browser is still valid, and a person with the
-- developer tools can clear a cookie. This stops a customer wandering out of
-- the catalogue, which is the thing that actually happens. Calling it more than
-- that would be a lie somebody later relies on.
--
-- The hash lives in its own table with no policies at all. In public.users it
-- would sit behind a select policy that deliberately lets colleagues see one
-- another, and `select *` would carry it out of the building. Here nothing
-- reaches it but the two definer functions below.

create table public.user_pins (
  user_id         uuid primary key references public.users (id) on delete cascade,
  pin_hash        text not null,
  set_at          timestamptz not null default now(),

  -- Four digits is 10,000 guesses, which is nothing to a machine and a lot to a
  -- person in a shop. The lockout is what makes the difference.
  failed_attempts integer not null default 0,
  locked_until    timestamptz
);

alter table public.user_pins enable row level security;

-- No policies, deliberately. There is no query anybody should be able to write
-- against this table; the functions below are the only way in.
revoke all on public.user_pins from authenticated, anon, service_role;

comment on table public.user_pins is
  'Four-digit unlock PINs, hashed. No RLS policies exist on purpose: only '
  'app.set_my_pin and app.verify_my_pin touch this, and both run as definer.';

-- Setting one -------------------------------------------------------------------
create function app.set_my_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  -- Exactly four digits. Checked here rather than only in the form, because a
  -- PIN that is three characters long on one path and four on another is a PIN
  -- nobody can reason about.
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'A PIN is four digits' using errcode = 'check_violation';
  end if;

  insert into public.user_pins (user_id, pin_hash)
  values (v_me, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash,
        set_at = now(),
        failed_attempts = 0,
        locked_until = null;
end;
$$;

-- Checking one --------------------------------------------------------------------
-- Returns true or false rather than raising, because a wrong PIN is an ordinary
-- thing a person does and not an error. A locked account raises, because that
-- one needs explaining.
create function app.verify_my_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := auth.uid();
  v_row  public.user_pins;
begin
  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from public.user_pins where user_id = v_me;
  if not found then
    -- No PIN set. Saying so is not a leak: it is the person's own account, and
    -- the screen has to tell them why nothing they type will work.
    raise exception 'No PIN has been set on this account'
      using errcode = 'no_data_found';
  end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    raise exception 'Too many wrong PINs. Try again after %',
      to_char(v_row.locked_until, 'HH24:MI')
      using errcode = 'insufficient_privilege';
  end if;

  if v_row.pin_hash = extensions.crypt(p_pin, v_row.pin_hash) then
    update public.user_pins
       set failed_attempts = 0, locked_until = null
     where user_id = v_me;
    return true;
  end if;

  -- Five tries, then five minutes. Long enough to make guessing pointless,
  -- short enough that a rep who fat-fingered it is not stranded.
  update public.user_pins
     set failed_attempts = failed_attempts + 1,
         locked_until = case when failed_attempts + 1 >= 5
                        then now() + interval '5 minutes' else null end
   where user_id = v_me;

  return false;
end;
$$;

revoke all on function app.set_my_pin(text) from public, authenticated, anon, service_role;
revoke all on function app.verify_my_pin(text) from public, authenticated, anon, service_role;

-- The doorways --------------------------------------------------------------------
create function public.set_my_pin(p_pin text)
returns void language sql security definer set search_path = ''
as $$ select app.set_my_pin(p_pin); $$;

create function public.verify_my_pin(p_pin text)
returns boolean language sql security definer set search_path = ''
as $$ select app.verify_my_pin(p_pin); $$;

-- Whether one exists, which the profile screen needs and which gives nothing
-- away: it is the caller's own account.
create function public.my_pin_is_set()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.user_pins where user_id = auth.uid()); $$;

revoke all on function public.set_my_pin(text) from public, anon;
revoke all on function public.verify_my_pin(text) from public, anon;
revoke all on function public.my_pin_is_set() from public, anon;

grant execute on function public.set_my_pin(text) to authenticated;
grant execute on function public.verify_my_pin(text) to authenticated;
grant execute on function public.my_pin_is_set() to authenticated;

notify pgrst, 'reload schema';
