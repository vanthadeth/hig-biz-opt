-- 0045_primary_currency
--
-- Which currency the app quotes in.
--
-- HIG prices in dollars and in riel, and the two are held separately because
-- there is no rate here and this app will not invent one. That is right for
-- storage and wrong for a screen: a rep holding a phone out to a shopkeeper
-- wants one number on it, in the currency that shop pays in, not a pair with a
-- dot between them for the customer to pick from.
--
-- So the prices stay as they are and the *display* gets a preference. Nothing
-- below converts anything; it chooses which of the two already-stored numbers
-- to show. An item priced in only the other one still shows that price rather
-- than nothing, because a price somebody cannot see is a sale they cannot make,
-- and the symbol in front of it says which currency it is.
--
-- Organisation-wide rather than personal, like the printers in 0018: what HIG
-- quotes in is a decision the business makes once, not a preference each rep
-- sets and then argues about at a counter.

create type public.currency as enum ('usd', 'khr');

create table public.app_settings (
  -- One row, and the constraint is what makes that true rather than a habit.
  -- A second row of settings is a second answer to every question in it.
  id               boolean primary key default true
                     constraint app_settings_singleton_ck check (id),
  primary_currency public.currency not null default 'usd',
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.users (id) on delete set null
);

insert into public.app_settings (id) values (true);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

-- Everybody reads it: every screen that shows a price needs to know. Only the
-- settings module changes it, exactly as with printers.
create policy app_settings_select on public.app_settings
  for select to authenticated using (true);

create policy app_settings_update on public.app_settings
  for update to authenticated
  using (app.can('settings', 'edit'))
  with check (app.can('settings', 'edit'));

-- No insert and no delete policy, deliberately: the row exists and there is
-- never a second one. Nothing may create or remove it from the app.
revoke all on public.app_settings from authenticated, anon;
grant select, update on public.app_settings to authenticated;

comment on table public.app_settings is
  'One row of organisation-wide settings. primary_currency chooses which of '
  'the two stored prices a screen shows; it converts nothing.';

notify pgrst, 'reload schema';
