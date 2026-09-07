-- 0047_visits
--
-- The visit: a rep standing in a shop, and what came of it.
--
-- 0025 left a column waiting for this. `customers.last_visit_date` has carried
-- the comment "Recorded by the visit and the sale, once those exist" since the
-- customer table was written, and nothing has ever set it. The trigger at the
-- bottom of this file is the other half of that sentence.
--
-- Two rules are worth reading before the schema, because most of what follows
-- exists to hold them up:
--
--   One open visit per person. A rep is in one shop at a time, so the phone
--   never has to ask which visit "Check out" means.
--
--   A visit is a record of something that happened. The times and places are
--   stamped by the app and are never editable afterwards; what the rep observed
--   is editable for a day. Those are different kinds of fact and the database
--   treats them differently.

-- What the visit was for, and what came of it -----------------------------------
-- Four enums rather than four lookup tables. These are the words on the buttons
-- of a form filled in standing up: the list is short, it changes about as often
-- as the business does, and a rep must never be able to type a fifth. Adding a
-- value later is `alter type ... add value` in a new migration, which is a
-- review, which is the point.
--
-- The screen wording lives in src/lib/visits.ts. These are storage values.
create type public.visit_type as enum (
  'sales_call',
  'collection',
  'delivery',
  'merchandising',
  'follow_up',
  'prospecting'
);

-- How the visit itself went, which is a different question from whether an order
-- came out of it. A shut shop is a visit that happened: the rep travelled, and
-- the round has a gap in it that somebody should see.
create type public.visit_status as enum (
  'completed',
  'shop_closed',
  'owner_away',
  'rescheduled',
  'cancelled'
);

create type public.visit_order_status as enum (
  'ordered',
  'no_order',
  -- Not "no" yet. A shopkeeper who is thinking about it is the reason the next
  -- appointment date below exists.
  'considering'
);

-- 'nothing_due' is not the same as 'no_payment', and collapsing them would lose
-- the only distinction a collections round cares about: a shop that owes nothing
-- versus a shop that owes and did not pay.
create type public.visit_payment_status as enum (
  'paid_in_full',
  'partial_payment',
  'no_payment',
  'nothing_due'
);

-- The visit ---------------------------------------------------------------------
create table public.visits (
  id           uuid primary key default gen_random_uuid(),

  -- Restrict rather than cascade: a customer that has been visited cannot be
  -- deleted out from under the record of the visit. The customer module soft
  -- deletes anyway (0031), so this is the belt to that pair of braces.
  customer_id  uuid not null references public.customers (id) on delete restrict,

  -- Whose visit this is. Defaulted to the caller for the same reason
  -- customers.owner_id is: a rep checking in does not name themselves, and
  -- `add` at 'own' scope then succeeds without the form knowing the rule.
  user_id      uuid not null references public.users (id) on delete restrict
                 default auth.uid(),

  -- The stamps. Written by the app, never by a person -- see guard_visit_edit.
  checked_in_at         timestamptz not null default now(),
  checked_in_latitude   numeric(9, 6),
  checked_in_longitude  numeric(9, 6),
  checked_out_at        timestamptz,
  checked_out_latitude  numeric(9, 6),
  checked_out_longitude numeric(9, 6),

  -- What the rep observed. Null while the visit is open: these are answered on
  -- the way out, not on the way in.
  visit_type            public.visit_type,
  status                public.visit_status,
  order_status          public.visit_order_status,
  payment_status        public.visit_payment_status,
  next_appointment_date date,
  remarks               text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Half a coordinate locates nothing, and reads on a map as the Gulf of
  -- Guinea. The same pair of rules customers carries, once per stamp.
  constraint visits_checked_in_latlong_pair_ck check (
    (checked_in_latitude is null and checked_in_longitude is null)
    or (checked_in_latitude is not null and checked_in_longitude is not null)
  ),
  constraint visits_checked_out_latlong_pair_ck check (
    (checked_out_latitude is null and checked_out_longitude is null)
    or (checked_out_latitude is not null and checked_out_longitude is not null)
  ),
  constraint visits_checked_in_latitude_ck check (
    checked_in_latitude is null or checked_in_latitude between -90 and 90
  ),
  constraint visits_checked_in_longitude_ck check (
    checked_in_longitude is null or checked_in_longitude between -180 and 180
  ),
  constraint visits_checked_out_latitude_ck check (
    checked_out_latitude is null or checked_out_latitude between -90 and 90
  ),
  constraint visits_checked_out_longitude_ck check (
    checked_out_longitude is null or checked_out_longitude between -180 and 180
  ),

  constraint visits_checkout_after_checkin_ck check (
    checked_out_at is null or checked_out_at >= checked_in_at
  ),

  -- Checking out is the act of filing the record, so a closed visit with no
  -- record cannot exist. This is what lets the report count statuses without
  -- having to say "of the visits that were filled in".
  constraint visits_closed_record_ck check (
    checked_out_at is null
    or (visit_type is not null
        and status is not null
        and order_status is not null
        and payment_status is not null)
  )
);

-- One shop at a time --------------------------------------------------------------
-- The same device as carts_one_per_person in 0043, and for a better reason: this
-- is what makes the centre button in the bar unambiguous. With this index there
-- is either an open visit or there is not, so the button reads "Check out" or
-- "Check in" and never has to ask which visit is meant.
--
-- It also stops the honest mistake -- a rep who forgot to check out of the last
-- shop, and would otherwise accumulate open visits all morning.
create unique index visits_one_open_per_person
  on public.visits (user_id)
  where checked_out_at is null;

create index on public.visits (user_id, checked_in_at desc);
create index on public.visits (customer_id, checked_in_at desc);
create index on public.visits (checked_in_at desc);

create trigger visits_set_updated_at
  before update on public.visits
  for each row execute function public.set_updated_at();

-- What may still be changed, and for how long -------------------------------------
--
-- Two different kinds of fact live in this row and they do not get the same
-- treatment.
--
-- The stamps are evidence: when the rep was there, and where the phone was when
-- it said so. Nothing in the app writes them twice, and this refuses the attempt
-- from anywhere else -- the REST endpoint included, which is the one that
-- matters, because a policy that only the form respects is not a rule.
-- checked_out_at is the single exception: it goes from null to a value exactly
-- once, and that write *is* the check-out.
--
-- The observations are a report, and reports get corrected. A rep who chose
-- "No order" and then took one on the doorstep has a day to fix it. After that
-- the visit is history, and history is somebody else's to amend: holding
-- visit.edit at 'any' scope (today, System Admin) passes the window, so a
-- genuine correction has a route that leaves a trace in the audit log rather
-- than being quietly done by the person it is about.
--
-- Definer, unlike guard_credit_limit in 0032, and for one specific reason: the
-- window's escape hatch has to ask what *scope* somebody holds, not merely
-- whether they hold the permission at all. app.can answers the second question
-- -- with no owner passed it means "do you hold this anywhere", which every rep
-- with 'own' would pass -- so this reads app.effective_scope directly, and
-- 0012 deliberately does not let `authenticated` call that. now() is read here,
-- on the server, so a phone with a wrong clock changes nothing.
create function public.guard_visit_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Nobody is signed in: a migration, a backfill, or anything holding the
  -- service role. Those callers already bypass row level security entirely, so
  -- refusing them here would protect nothing and would break a legitimate fix.
  if auth.uid() is null then
    return new;
  end if;

  if new.checked_in_at is distinct from old.checked_in_at
     or new.checked_in_latitude is distinct from old.checked_in_latitude
     or new.checked_in_longitude is distinct from old.checked_in_longitude then
    raise exception 'When a visit started cannot be changed'
      using errcode = 'check_violation';
  end if;

  -- Written once, on the way out. Afterwards it is evidence like the rest.
  if old.checked_out_at is not null
     and (new.checked_out_at is distinct from old.checked_out_at
          or new.checked_out_latitude is distinct from old.checked_out_latitude
          or new.checked_out_longitude is distinct from old.checked_out_longitude) then
    raise exception 'When a visit ended cannot be changed'
      using errcode = 'check_violation';
  end if;

  -- An open visit is still being made. The window runs from the moment it was
  -- closed, which is the moment the record became a record.
  if old.checked_out_at is not null
     and now() > old.checked_out_at + interval '24 hours'
     and app.effective_scope(auth.uid(), 'visit', 'edit') is distinct from 'any' then
    raise exception 'This visit can no longer be edited. It was closed more than 24 hours ago.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger visits_guard_edit
  before update on public.visits
  for each row execute function public.guard_visit_edit();

-- Not an RPC. 0023 established the rule: a trigger function is reachable only
-- from the trigger that fires it.
revoke execute on function public.guard_visit_edit() from public, anon, authenticated, service_role;

-- The column 0025 left waiting ------------------------------------------------------
--
-- Definer, because a rep holds customer.view but very often not customer.edit,
-- and this is not the rep editing a shop -- it is the app recording that the
-- shop was visited. Writing it through the rep's own policy would make the
-- stamp depend on a permission that has nothing to do with it.
--
-- Forward only. A visit filed late, or a correction to an older one, must not
-- rewind a date that a later visit already moved on.
create function public.stamp_customer_last_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.checked_out_at is null and new.checked_out_at is not null then
    update public.customers
       set last_visit_date = greatest(
             coalesce(last_visit_date, new.checked_out_at::date),
             new.checked_out_at::date
           )
     where id = new.customer_id;
  end if;

  return null;
end;
$$;

create trigger visits_stamp_customer_last_visit
  after update on public.visits
  for each row execute function public.stamp_customer_last_visit();

revoke execute on function public.stamp_customer_last_visit() from public, anon, authenticated, service_role;

-- Audited ----------------------------------------------------------------------
--
-- 0030 audits the access model, the catalogue, the customer book and the
-- settings, and deliberately not the carts and orders that came after: those
-- are the business happening, and a log of every line added to a cart is noise.
--
-- A visit joins the audited list anyway, because of the sentence above about
-- who may edit one after a day. The window makes a rep's own corrections
-- self-limiting; the escape hatch does not, and an admin quietly restating what
-- a rep reported from a shop is exactly the kind of edit somebody should be
-- able to find a year later. The stamps cannot be changed at all, so what the
-- log carries is the observations, which is the part that is worth an argument.
create trigger visits_audit
  after insert or update or delete on public.visits
  for each row execute function public.record_audit();

-- Access ------------------------------------------------------------------------
-- Keyed on the rep, exactly as the customer policies key on the owner: view at
-- 'own' sees your round, at 'sub' sees your team's, at 'any' sees the company's.
alter table public.visits enable row level security;

create policy visits_select on public.visits
  for select to authenticated
  using (app.can('visit', 'view', user_id));

-- Two questions, both of which have to answer yes. May you record visits, and
-- could you have seen this shop at all? Without the second, the customer id is
-- an unchecked reference into a table whose whole point is that not everybody
-- sees all of it.
create policy visits_insert on public.visits
  for insert to authenticated
  with check (
    app.can('visit', 'add', user_id)
    and app.can('customer', 'view', app.customer_owner(customer_id))
  );

create policy visits_update on public.visits
  for update to authenticated
  using (app.can('visit', 'edit', user_id))
  with check (app.can('visit', 'edit', user_id));

create policy visits_delete on public.visits
  for delete to authenticated
  using (app.can('visit', 'delete', user_id));

grant select, insert, update, delete on public.visits to authenticated;

-- The visit, with the shop's name on it ---------------------------------------------
-- security_invoker, so the policies above still decide every row: the view
-- collapses a join, it does not open a door. Same device as customer_directory.
create view public.visit_log
with (security_invoker = true)
as
  select
    v.id,
    v.customer_id,
    v.user_id,
    c.shop_name,
    c.street_address,
    c.district_text,
    c.province_text,
    c.latitude  as customer_latitude,
    c.longitude as customer_longitude,
    u.full_name as rep_name,
    v.checked_in_at,
    v.checked_in_latitude,
    v.checked_in_longitude,
    v.checked_out_at,
    v.checked_out_latitude,
    v.checked_out_longitude,
    v.visit_type,
    v.status,
    v.order_status,
    v.payment_status,
    v.next_appointment_date,
    v.remarks,
    v.created_at,
    v.updated_at
  from public.visits v
  join public.customers c on c.id = v.customer_id
  left join public.users u on u.id = v.user_id;

grant select on public.visit_log to authenticated;

-- The module, and the workspace it is the whole of -----------------------------------
--
-- One module row, because permission is granted per module and "may this person
-- record visits" is one question. The href is where the record lives.
insert into public.modules (key, name, icon, href, sort_order, group_name) values
  ('visit', 'Visit', 'pin', 'visits', 13, 'Sales');

-- A fifth view. Unlike the other four this one is not a set of modules to
-- navigate between -- it is a single app with three fixed buttons, which is why
-- its shell is its own. The view row still earns its place: it is what puts
-- "My Visit" in the chooser, what resolveEntryPath sends a rep straight into,
-- and what the entitlement check on every /visit request reads.
insert into public.views (key, name, description, icon, sort_order) values
  ('visit', 'My Visit', 'Check in at a shop, record the visit, check out', 'pin', 5);

-- The bar in this view is fixed rather than assembled from my_nav, so this row
-- is not what draws it. It is here so the module is filed somewhere -- the Menu
-- in the other views reads my_modules, and a module belonging to no view is a
-- module nobody can find.
insert into public.view_modules (view_key, module_key, sort_order) values
  ('visit', 'visit', 1);

-- Who gets the workspace. Everyone who sells, and the admin who has to be able
-- to look at it.
insert into public.role_views (role_id, view_key, sort_order)
select r.id, 'visit', 5
from public.roles r
where r.key in ('system_admin', 'sales', 'sales_supervisor', 'sales_manager');

insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'visit', a.action::public.permission_action, 'any'::public.permission_scope
from public.roles r
cross join (values ('view'), ('add'), ('edit'), ('delete')) as a(action)
where r.key = 'system_admin';

-- 'own' to begin with, including for the supervisors. A supervisor overseeing a
-- team probably wants 'sub' here, but that is a fact about how HIG is organised
-- rather than one to assert in a migration, and the Roles screen is where it
-- belongs. No delete for anyone but the admin: a visit is evidence.
insert into public.role_permissions (role_id, module_key, action, scope)
select r.id, 'visit', a.action::public.permission_action, 'own'::public.permission_scope
from public.roles r
cross join (values ('view'), ('add'), ('edit')) as a(action)
where r.key in ('sales', 'sales_supervisor', 'sales_manager');

comment on table public.visits is
  'One rep, one shop, one call. The stamps are evidence and are immutable; the '
  'observations may be corrected for 24 hours after check-out. See '
  'public.guard_visit_edit.';
