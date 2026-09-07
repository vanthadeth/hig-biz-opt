-- 0052_one_sheet_column_many_targets
--
-- A sheet column may feed more than one target column.
--
-- `sync_column_maps_one_per_sheet_column` was written when a mapping was a
-- one-to-one pairing: this column of the sheet goes into that column of the
-- table, and offering the same sheet column twice could only be a slip. That
-- stopped being true the moment a cell could be split.
--
-- The customer sync is built on exactly that. One cell holds "11.5564,
-- 104.9282" and two mappings read it, one taking the latitude and one the
-- longitude. The customer's sheet ID feeds both `customer_id` — resolved to
-- our own key — and `sheet_id`, with a `#1` suffix that gives the phone in
-- slot one a stable identity of its own. Neither is a slip; both are the
-- design, and the index refused them both. Hence "the sync could not be
-- created": the definition was written, the mappings were not, and the second
-- of the two GPS rows collided with the first.
--
-- WHAT ACTUALLY HAS TO BE UNIQUE IS THE TARGET. Filling one column of one
-- table from two different sheet columns is the contradiction — the writer
-- would have to pick one and there is no right answer. That constraint,
-- `sync_column_maps_one_per_target_column`, already exists and stays.
--
-- The reading side was fixed for this a while ago: `buildRows` iterates the
-- mappings rather than a map keyed by sheet column, so a second mapping of one
-- column no longer silently replaces the first. This is the same disagreement
-- on the writing side, which is where it was still biting.

drop index if exists public.sync_column_maps_one_per_sheet_column;

comment on index public.sync_column_maps_one_per_target_column is
  'One mapping per target column. The sheet side is deliberately not unique: '
  'one cell can hold a coordinate pair, or an id that is both a parent link '
  'and the basis of a child key.';
