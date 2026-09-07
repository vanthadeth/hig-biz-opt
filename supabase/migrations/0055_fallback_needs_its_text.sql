-- 0055_fallback_needs_its_text
--
-- The other half of 0054, which had to be its own migration: Postgres will not
-- let a new enum value be *used* in the transaction that added it.
--
-- A suffix and a fallback are both nothing without the text they carry, so one
-- constraint now says so for both.

alter table public.sync_column_maps
  drop constraint sync_column_maps_suffix_ck,
  add constraint sync_column_maps_arg_ck check (
    transform not in ('suffix', 'fallback')
    or (transform_arg is not null and btrim(transform_arg) <> '')
  );

notify pgrst, 'reload schema';
