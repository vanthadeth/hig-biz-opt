-- 0025_customers
--
-- The shops HIG sells to.
--
-- This is the first module where permission *scope* does real work. Sales holds
-- customer.add and customer.edit at 'own' and warehouse holds view at 'sub', so
-- a customer needs an owner for those to mean anything — the rep whose account
-- it is. Every policy below keys on that owner rather than on the module alone.
--
-- A customer with no owner is a house account: visible to anyone holding the
-- module at any scope. That is a decision rather than an oversight, and the
-- suite asserts it, because `app.can(module, action, null)` answering "do you
-- hold this at all" would otherwise make it look accidental.

-- Cambodian administrative geography -------------------------------------------
-- Reference data, not customer data. It lives in its own tables so an address
-- can be *chosen* rather than retyped, and so a misspelt commune does not become
-- a second commune.
--
-- These are populated by import, not by a live call to a government service. A
-- sales rep standing in a shop with one bar of signal should not be unable to
-- save an address because somebody else's API is down — and an address entered
-- last year should keep reading the same way even if that service reshapes its
-- data. `*_code` holds the official code when one was picked; the matching
-- `*_text` column holds what somebody typed when it was not. Nothing is lost
-- either way, and the directory view resolves whichever is present.
create table public.geo_provinces (
  code        text primary key,
  name_en     text not null,
  name_km     text,
  sort_order  integer not null default 0,
  constraint geo_provinces_name_en_ck check (btrim(name_en) <> '')
);

create table public.geo_districts (
  code          text primary key,
  province_code text not null references public.geo_provinces (code) on delete restrict,
  name_en       text not null,
  name_km       text,
  constraint geo_districts_name_en_ck check (btrim(name_en) <> '')
);

create table public.geo_communes (
  code          text primary key,
  district_code text not null references public.geo_districts (code) on delete restrict,
  name_en       text not null,
  name_km       text,
  constraint geo_communes_name_en_ck check (btrim(name_en) <> '')
);

create index on public.geo_districts (province_code, name_en);
create index on public.geo_communes (district_code, name_en);

-- The 25 provinces and municipalities, with their official codes.
--
-- Khmer names are deliberately left null rather than guessed at. A misspelt
-- province name in a Cambodian business system is worse than an absent one, and
-- these are the rows every address in the country hangs off. They arrive with
-- the district and commune import, or can be typed in once and kept.
insert into public.geo_provinces (code, name_en, sort_order) values
  ('01', 'Banteay Meanchey',  1),
  ('02', 'Battambang',        2),
  ('03', 'Kampong Cham',      3),
  ('04', 'Kampong Chhnang',   4),
  ('05', 'Kampong Speu',      5),
  ('06', 'Kampong Thom',      6),
  ('07', 'Kampot',            7),
  ('08', 'Kandal',            8),
  ('09', 'Koh Kong',          9),
  ('10', 'Kratie',           10),
  ('11', 'Mondul Kiri',      11),
  ('12', 'Phnom Penh',       12),
  ('13', 'Preah Vihear',     13),
  ('14', 'Prey Veng',        14),
  ('15', 'Pursat',           15),
  ('16', 'Ratanak Kiri',     16),
  ('17', 'Siem Reap',        17),
  ('18', 'Preah Sihanouk',   18),
  ('19', 'Stung Treng',      19),
  ('20', 'Svay Rieng',       20),
  ('21', 'Takeo',            21),
  ('22', 'Oddar Meanchey',   22),
  ('23', 'Kep',              23),
  ('24', 'Pailin',           24),
  ('25', 'Tboung Khmum',     25);

-- Customers ---------------------------------------------------------------------
create type public.customer_status as enum ('active', 'inactive', 'banned');

create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  shop_name       text not null,
  business_type   text,

  -- Whose account this is. Defaulted to the caller so a rep creating one does
  -- not have to name themselves, and so `add` at 'own' scope succeeds without
  -- the form having to know the rule.
  owner_id        uuid references public.users (id) on delete set null default auth.uid(),

  -- Address
  street_address  text,
  province_code   text references public.geo_provinces (code) on delete set null,
  district_code   text references public.geo_districts (code) on delete set null,
  commune_code    text references public.geo_communes (code) on delete set null,
  province_text   text,
  district_text   text,
  commune_text    text,
  landmark        text,
  zipcode         text,
  latitude        numeric(9, 6),
  longitude       numeric(9, 6),

  -- Commercial
  status          public.customer_status not null default 'active',
  status_note     text,
  credit_limit_usd numeric(12, 2),
  remarks         text,

  -- Recorded by the visit and the sale, once those exist.
  last_visit_date    date,
  last_purchase_date date,

  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint customers_shop_name_ck check (btrim(shop_name) <> ''),
  constraint customers_credit_limit_ck check (credit_limit_usd is null or credit_limit_usd >= 0),
  -- Half a coordinate locates nothing, and reads on a map as the Gulf of Guinea.
  constraint customers_latlong_pair_ck check (
    (latitude is null and longitude is null) or (latitude is not null and longitude is not null)
  ),
  constraint customers_latitude_ck  check (latitude  is null or latitude  between -90  and 90),
  constraint customers_longitude_ck check (longitude is null or longitude between -180 and 180),
  -- A banned shop needs a reason on the record. Somebody will ask why in a year.
  constraint customers_banned_note_ck check (
    status <> 'banned' or (status_note is not null and btrim(status_note) <> '')
  )
);

create index on public.customers (owner_id);
create index on public.customers (status);
create index on public.customers (province_code);
create index on public.customers (shop_name);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- The administrative chain has to agree with itself -----------------------------
-- Three foreign keys each hold their own row, and none of them stops a district
-- in Battambang being filed under Kandal. This does.
create function public.guard_customer_geography()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent text;
begin
  if new.district_code is not null then
    select d.province_code into v_parent
    from public.geo_districts d where d.code = new.district_code;

    if new.province_code is null then
      -- Filling it in beats refusing: the district already knows its province.
      new.province_code := v_parent;
    elsif new.province_code is distinct from v_parent then
      raise exception 'That district is not in the chosen province'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.commune_code is not null then
    select c.district_code into v_parent
    from public.geo_communes c where c.code = new.commune_code;

    if new.district_code is null then
      new.district_code := v_parent;
      select d.province_code into new.province_code
      from public.geo_districts d where d.code = new.district_code;
    elsif new.district_code is distinct from v_parent then
      raise exception 'That commune is not in the chosen district'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger customers_guard_geography
  before insert or update on public.customers
  for each row execute function public.guard_customer_geography();

revoke execute on function public.guard_customer_geography() from public, anon, authenticated, service_role;

-- Contacts ----------------------------------------------------------------------
-- A shop is a set of people, and which of them to ring first is a fact about the
-- shop rather than a matter of row order.
create table public.customer_contacts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  name        text not null,
  position    text,
  phone       text,
  telegram_id text,
  is_primary  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint customer_contacts_name_ck check (btrim(name) <> '')
);

-- At most one primary, enforced rather than merely intended.
create unique index customer_contacts_one_primary
  on public.customer_contacts (customer_id) where is_primary;
create index on public.customer_contacts (customer_id, sort_order);

create trigger customer_contacts_set_updated_at
  before update on public.customer_contacts
  for each row execute function public.set_updated_at();

-- Pictures ----------------------------------------------------------------------
create table public.customer_pictures (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  photo_path  text not null,
  description text,
  is_primary  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),

  constraint customer_pictures_photo_path_ck check (btrim(photo_path) <> '')
);

create unique index customer_pictures_one_primary
  on public.customer_pictures (customer_id) where is_primary;
create index on public.customer_pictures (customer_id, sort_order);

-- Reading a customer list in one query ------------------------------------------
-- The list wants a shop name, where it is, who to ring and who owns the account.
-- Assembling that in the browser would be five requests and a join by hand.
create view public.customer_directory
with (security_invoker = true)
as
  select
    c.id,
    c.shop_name,
    c.business_type,
    c.status,
    c.owner_id,
    u.full_name    as owner_name,
    c.street_address,
    c.landmark,
    c.zipcode,
    c.latitude,
    c.longitude,
    c.credit_limit_usd,
    c.last_visit_date,
    c.last_purchase_date,
    -- Whichever is present: the reference name when a code was picked, the
    -- typed one when it was not.
    coalesce(p.name_en, c.province_text) as province_name,
    coalesce(d.name_en, c.district_text) as district_name,
    coalesce(m.name_en, c.commune_text)  as commune_name,
    c.province_code,
    c.district_code,
    c.commune_code,
    ct.name  as primary_contact_name,
    ct.phone as primary_contact_phone,
    pic.photo_path as primary_photo_path,
    (select count(*) from public.customer_contacts x where x.customer_id = c.id) as contact_count
  from public.customers c
  left join public.users u          on u.id = c.owner_id
  left join public.geo_provinces p  on p.code = c.province_code
  left join public.geo_districts d  on d.code = c.district_code
  left join public.geo_communes m   on m.code = c.commune_code
  left join lateral (
    select x.name, x.phone
    from public.customer_contacts x
    where x.customer_id = c.id
    order by x.is_primary desc, x.sort_order, x.created_at
    limit 1
  ) ct on true
  left join lateral (
    select y.photo_path
    from public.customer_pictures y
    where y.customer_id = c.id
    order by y.is_primary desc, y.sort_order, y.created_at
    limit 1
  ) pic on true;

-- Row level security ------------------------------------------------------------
alter table public.geo_provinces      enable row level security;
alter table public.geo_districts      enable row level security;
alter table public.geo_communes       enable row level security;
alter table public.customers          enable row level security;
alter table public.customer_contacts  enable row level security;
alter table public.customer_pictures  enable row level security;

-- Geography is reference data the address form needs before it can draw
-- anything; importing it is an administrator's job.
do $$
declare
  t text;
begin
  foreach t in array array['geo_provinces', 'geo_districts', 'geo_communes'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (app.can(''settings'', ''edit'')) with check (app.can(''settings'', ''edit''))',
      t || '_write', t
    );
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

create policy customers_select on public.customers
  for select to authenticated
  using (app.can('customer', 'view', owner_id));

create policy customers_insert on public.customers
  for insert to authenticated
  with check (app.can('customer', 'add', owner_id));

create policy customers_update on public.customers
  for update to authenticated
  using (app.can('customer', 'edit', owner_id))
  with check (app.can('customer', 'edit', owner_id));

create policy customers_delete on public.customers
  for delete to authenticated
  using (app.can('customer', 'delete', owner_id));

-- Who owns the customer a child row hangs off ----------------------------------
-- Security definer, and for the usual reason turned around: the policies on the
-- child tables need the parent's owner, and reading it through the parent's own
-- policy would make a contact invisible exactly when it is being checked.
create function app.customer_owner(p_customer uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.owner_id from public.customers c where c.id = p_customer;
$$;

grant execute on function app.customer_owner(uuid) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['customer_contacts', 'customer_pictures'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (app.can(''customer'', ''view'', app.customer_owner(customer_id)))',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      || 'with check (app.can(''customer'', ''edit'', app.customer_owner(customer_id)))',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using (app.can(''customer'', ''edit'', app.customer_owner(customer_id))) '
      || 'with check (app.can(''customer'', ''edit'', app.customer_owner(customer_id)))',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      || 'using (app.can(''customer'', ''edit'', app.customer_owner(customer_id)))',
      t || '_delete', t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

grant select, insert, update, delete on public.customers to authenticated;
grant select on public.customer_directory to authenticated;

-- Pictures ----------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customers', 'customers', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- Objects sit under "<customer id>/…", so the owning customer is the first path
-- segment and the same scope rule reaches the photograph as reaches the record.
create policy customers_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'customers'
    and app.can('customer', 'view', app.customer_owner(((storage.foldername(name))[1])::uuid))
  );

create policy customers_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'customers'
    and app.can('customer', 'edit', app.customer_owner(((storage.foldername(name))[1])::uuid))
  );

create policy customers_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'customers'
    and app.can('customer', 'edit', app.customer_owner(((storage.foldername(name))[1])::uuid))
  );

create policy customers_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'customers'
    and app.can('customer', 'edit', app.customer_owner(((storage.foldername(name))[1])::uuid))
  );
