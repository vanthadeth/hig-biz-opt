-- 0042_test_items
--
-- Ten items to browse, so the catalogue can be looked at rather than reasoned
-- about. Not real stock: made up to put every state the catalogue screen can
-- draw in front of somebody at once.
--
--   * four categories, so the grouping has something to group
--   * codes that sort inside each group, so the ordering is visible
--   * all three availabilities: out of stock, low, plenty
--   * one item with no KHR price and no packing, so the gaps are seen too
--
-- Removing them is one statement, and the codes are the handle:
--
--     delete from public.items where code like 'A101-%' or code like 'D200-%'
--        or code like 'D500-%' or code like 'E100-%';
--
-- They carry no sheet_id, so they are not what the Google Sheets sync thinks it
-- wrote: clearing a sync's imported rows leaves them alone. Clearing *all* rows
-- of the items table takes them, which is the correct answer for test data.
--
-- Categories and brands are looked up by name rather than by id, because both
-- tables are filled by the sheet sync and their ids are generated. The four
-- category codes below each match exactly one row.

insert into public.items (
  code, name, name_alt, description, category_id, brand_id,
  price_usd, price_khr, qty_per_box, qty_per_carton,
  stock_qty, low_stock_qty, active
)
select
  v.code, v.name, v.name_alt, v.description,
  (select id from public.item_categories where name like v.category_prefix || '%' limit 1),
  (select id from public.brands where name = v.brand limit 1),
  v.price_usd, v.price_khr, v.qty_per_box, v.qty_per_carton,
  v.stock_qty, v.low_stock_qty, true
from (values
  -- Padlocks. The three sizes carry the three availabilities, in order.
  ('A101-001', 'Padlock 40mm', 'សោត្រដោក 40mm',
   'Brass body, three keys. The size that moves fastest.',
   'A101', 'KOKI',  2.50, 10250::numeric, 12, 144, 240, 24),
  ('A101-002', 'Padlock 50mm', 'សោត្រដោក 50mm',
   'Brass body, three keys. One size up from the 40mm.',
   'A101', 'KOKI',  3.20, 13100::numeric, 12, 144,  18, 24),   -- low
  ('A101-003', 'Padlock 60mm', 'សោត្រដោក 60mm',
   'Hardened shackle. For gates and roller shutters.',
   'A101', 'NOKOR', 4.10, 16800::numeric, 12, 120,   0, 20),   -- none

  -- Screwdrivers. The second has no KHR price and no packing, on purpose.
  ('D200-001', 'Screwdriver Set 6pcs', 'ឈុតទួណឺវិស ៦ដើម',
   'Three flat, three cross. Magnetic tips, plastic case.',
   'D200', 'MINDY', 7.50, 30800::numeric, 10,  60,  55, 10),
  ('D200-002', 'Precision Screwdriver 2.0mm', 'ទួណឺវិសល្អិត 2.0mm',
   'For spectacles and phone repair.',
   'D200', 'MINDY', 1.25, null::numeric,  null, null, 30,  5),

  -- Hammers.
  ('D500-001', 'Claw Hammer 8oz', 'ញញួរ 8oz',
   'Wooden handle. The light one, for finishing work.',
   'D500', 'KENDO', 3.75, 15400::numeric,  6,  72,  96, 12),
  ('D500-002', 'Claw Hammer 16oz', 'ញញួរ 16oz',
   'Wooden handle. The everyday size.',
   'D500', 'KENDO', 5.90, 24200::numeric,  6,  72,  40, 12),
  ('D500-003', 'Rubber Mallet 450g', 'ញញួរកៅស៊ូ 450g',
   'Black rubber head. Leaves no mark on tile.',
   'D500', 'TENSO', 4.50, 18500::numeric,  6,  60,   8, 10),   -- low

  -- Knives, and the blades that go in them.
  ('E100-001', 'Utility Knife 18mm', 'កាំបិត 18mm',
   'Metal body, auto-lock slider. Takes the blade below.',
   'E100', 'HACKER', 1.80, 7400::numeric, 24, 288, 500, 50),
  ('E100-002', 'Blade Refill 18mm, 10 pcs', 'ផ្លែកាំបិត 18mm ១០ផ្លែ',
   'Snap-off blades, ten to a tube.',
   'E100', 'HACKER', 0.90, 3700::numeric, 20, 400, 1200, 100)
) as v (
  code, name, name_alt, description, category_prefix, brand,
  price_usd, price_khr, qty_per_box, qty_per_carton, stock_qty, low_stock_qty
)
-- Re-runnable: a code that is already there is left exactly as it is, so this
-- cannot overwrite a real item that later takes one of these codes.
where not exists (
  select 1 from public.items i where lower(i.code) = lower(v.code)
);
