-- 0031_customer_soft_delete
--
-- Nothing in the customer module is deleted any more.
--
-- A shop already had this right: its status carries it out of use while its
-- history stays readable. Its contacts and pictures did not — they were removed
-- outright, and with them the only record that the person who used to answer
-- that phone ever worked there. On a book of accounts that is the wrong
-- default, and now that 0030 records every change, a delete is also the one
-- event whose audit entry can never be followed back to a live record.
--
-- So:
--
--   * customer_contacts and customer_pictures gain `active`
--   * the delete policies on all three tables go, and so does the grant
--   * the "one primary" indexes count only active rows, or a retired primary
--     would block the person who replaced them
--   * customer_directory ignores what has been retired when it picks the
--     contact to ring and counts the people at a shop
--
-- The storage objects behind retired pictures stay. A picture that can be
-- brought back needs its file, and this migration is about not destroying
-- things.

alter table public.customer_contacts
  add column active boolean not null default true;

alter table public.customer_pictures
  add column active boolean not null default true;

create index on public.customer_contacts (customer_id) where active;
create index on public.customer_pictures (customer_id) where active;

-- A retired primary must not hold the slot. Somebody leaves the shop, the next
-- person becomes who you ring, and the record of the first one stays.
drop index customer_contacts_one_primary;
create unique index customer_contacts_one_primary
  on public.customer_contacts (customer_id) where is_primary and active;

drop index customer_pictures_one_primary;
create unique index customer_pictures_one_primary
  on public.customer_pictures (customer_id) where is_primary and active;

-- The directory ------------------------------------------------------------------
-- Same columns, so this replaces rather than rebuilds. What changes is that a
-- retired contact is no longer the one the list offers to ring, and no longer
-- counted among the people at a shop.
create or replace view public.customer_directory
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
    coalesce(p.name_en, c.province_text) as province_name,
    coalesce(d.name_en, c.district_text) as district_name,
    coalesce(m.name_en, c.commune_text)  as commune_name,
    c.province_code,
    c.district_code,
    c.commune_code,
    ct.name  as primary_contact_name,
    ct.phone as primary_contact_phone,
    pic.photo_path as primary_photo_path,
    (select count(*) from public.customer_contacts x
      where x.customer_id = c.id and x.active) as contact_count
  from public.customers c
  left join public.users u          on u.id = c.owner_id
  left join public.geo_provinces p  on p.code = c.province_code
  left join public.geo_districts d  on d.code = c.district_code
  left join public.geo_communes m   on m.code = c.commune_code
  left join lateral (
    select x.name, x.phone
    from public.customer_contacts x
    where x.customer_id = c.id and x.active
    order by x.is_primary desc, x.sort_order, x.created_at
    limit 1
  ) ct on true
  left join lateral (
    select y.photo_path
    from public.customer_pictures y
    where y.customer_id = c.id and y.active
    order by y.is_primary desc, y.sort_order, y.created_at
    limit 1
  ) pic on true;

grant select on public.customer_directory to authenticated;

-- Taking the delete away ----------------------------------------------------------
-- Both halves, because either alone is a half-measure: without the policy the
-- statement is refused, and without the grant there is no statement to refuse.
-- A future policy written by hand cannot reopen this on its own.
drop policy customers_delete on public.customers;
drop policy customer_contacts_delete on public.customer_contacts;
drop policy customer_pictures_delete on public.customer_pictures;

revoke delete on public.customers          from authenticated;
revoke delete on public.customer_contacts  from authenticated;
revoke delete on public.customer_pictures  from authenticated;

-- `customer.delete` stays in the permission matrix rather than being deleted
-- from it. It is held by the system administrator and now grants nothing here,
-- which is the honest state of affairs: the permission exists, and the module
-- has stopped offering anything for it to unlock. Removing the rows would
-- rewrite what somebody was granted, which is not this migration's business.
comment on table public.customer_contacts is
  'Contacts are retired with active = false, never deleted. The delete policy '
  'and grant were removed in 0031.';
comment on table public.customer_pictures is
  'Pictures are retired with active = false, never deleted. The storage object '
  'stays so a retired picture can be brought back.';
