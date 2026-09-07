-- 0046_sync_transforms
--
-- Three shapes the customer sheet has that the database does not.
--
-- A SHEET COLUMN THAT IS TWO COLUMNS HERE. The sheet keeps a location as one
-- cell — "11.5564, 104.9282" — and this database keeps latitude and longitude
-- apart, because half a coordinate locates nothing and a check constraint says
-- so. Two mappings now read the same sheet column and take a different half of
-- it. Nothing about the sheet changes; the splitting is ours.
--
-- CONTACTS THAT LIVE IN THE CUSTOMER'S ROW. Here they are their own rows in
-- their own table, which is right — a shop has a manager and a purchaser and
-- sometimes a third person — but it means one sheet row becomes a customer and
-- one or more contacts. That is a second sync over the same tab, targeting
-- customer_contacts, resolving the customer by its sheet ID exactly as the
-- province is resolved.
--
-- The trouble with that is identity. A contact sitting in the customer's row
-- has no ID of its own, so a second run would insert it again rather than
-- update it. `suffix` gives it one: the customer's own sheet ID with a slot
-- appended, so contact one is always contact one and re-running rewrites it
-- rather than duplicating it.
--
-- AND EMPTY SLOTS. Most customers have one contact, so the columns for a
-- second are usually blank. The synthesised ID is present either way, so the
-- key check cannot see the difference; `require_column` can — a row whose
-- contact name is empty is not a contact.

create type public.sync_transform as enum (
  -- Taken as it comes.
  'none',
  -- Halves of one "lat, long" cell.
  'latitude',
  'longitude',
  -- The cell with transform_arg appended. For giving a child row an identity
  -- derived from its parent's.
  'suffix'
);

alter table public.sync_column_maps
  add column transform public.sync_transform not null default 'none',
  add column transform_arg text;

comment on column public.sync_column_maps.transform is
  'What to do with the cell before it is written. Two mappings may read one '
  'sheet column with different transforms, which is how one cell becomes two '
  'columns.';
comment on column public.sync_column_maps.transform_arg is
  'The suffix, for transform = suffix. Ignored by every other transform.';

alter table public.sync_definitions
  add column require_column text;

comment on column public.sync_definitions.require_column is
  'A target column that must not be empty for the row to be written. For a '
  'child sync over a parent''s tab, where the slot is often blank.';

-- A suffix with nothing to append is a mapping that does nothing and looks
-- like it does something.
alter table public.sync_column_maps
  add constraint sync_column_maps_suffix_ck check (
    transform <> 'suffix' or (transform_arg is not null and btrim(transform_arg) <> '')
  );

notify pgrst, 'reload schema';
