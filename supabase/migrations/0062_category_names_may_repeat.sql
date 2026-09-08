-- 0062_category_names_may_repeat
--
-- Two partial unique indexes said a category's name had to be one nobody else
-- at its level was using — siblings under one parent, or the top-level list
-- itself. That was a guard against typing the same category in twice by
-- hand; it was never a rule about the business, and the sub-category sheet
-- does not follow it — sibling groups there genuinely share a name, and every
-- one of those rows is real: a sync that refuses the second is not
-- protecting the catalogue, it is refusing to import it.
--
-- Matching is still exact everywhere it matters: `parent_id` for the tree,
-- `sheet_id` for a row that came from a sheet, `id` for everything else. Two
-- categories now sharing a name are still two different rows.

drop index public.item_categories_child_name_unique;
drop index public.item_categories_top_name_unique;
