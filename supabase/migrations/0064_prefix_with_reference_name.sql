-- 0064_prefix_with_reference_name
--
-- The item sheet's NAME column is the item alone — "Coca Cola", not
-- "Beverages Coca Cola" — but two items in different categories can and do
-- share that name now that 0063 let item codes repeat too. What actually
-- identifies an item at a glance is its category and its name together, so
-- the item's stored name should say both.
--
-- A new transform rather than a one-off: any sync with a reference column
-- (one mapping another table's sheet id onto a foreign key here) can mark a
-- text column to be written as "<the referenced row's name> <this cell's own
-- text>". The sync engine resolves it — see `withReferenceNamePrefix` in
-- src/lib/sync.ts — the same way `drive_image` is resolved outside
-- `sync_apply` rather than inside it: `sync_apply` still only ever writes
-- what it is handed, nothing it looked up itself.
--
-- Its own migration for the usual reason: Postgres will not let a new enum
-- value be used in the transaction that added it.

alter type public.sync_transform add value if not exists 'reference_name_prefix';
