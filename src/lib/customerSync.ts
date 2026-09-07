/**
 * The customer sheet, which is shaped differently from this database in two
 * ways that no ordinary mapping can express.
 *
 * A LOCATION KEPT IN ONE CELL. "11.5564, 104.9282" where `customers` keeps
 * latitude and longitude apart, because half a coordinate locates nothing and
 * a constraint says so. Two mappings read that one column and take a half
 * each.
 *
 * PHONES KEPT IN THE CUSTOMER'S ROW. Phone 1, 2 and 3 with a label beside each,
 * where here a contact is a row of its own in `customer_contacts`. One sheet
 * row is therefore one customer and up to three contacts — which is not one
 * sync but four, because a sync maps a sheet column to a target column and
 * "Phone 1" and "Phone 2" are different columns feeding the same one.
 *
 * The hard part of that is identity. A phone sitting in its customer's row has
 * no ID, so a second run would insert it again rather than update it. Each slot
 * derives one from the customer's own sheet ID — `CUS-7#1` is always the first
 * phone of that customer — so re-running rewrites rather than duplicates.
 *
 * This module only plans. It builds the rows that would be written and nothing
 * else, so what the builder is about to create can be counted, shown, and
 * tested without a database or a spreadsheet anywhere near it.
 */

import type { SyncTransform } from "@/lib/sync";

/** One phone in the customer's row, and the label beside it. */
export type ContactSlot = { phone: string; label: string };

export type CustomerSyncPicks = {
  spreadsheetId: string;
  tab: string;
  headerRow: number;
  /** The sheet's own ID for the customer. Everything hangs off it. */
  sheetIdColumn: string;
  /** Sheet column per plain customer field, blank where it is not mapped. */
  fields: Partial<Record<CustomerField, string>>;
  /** The one cell holding "latitude, longitude". */
  locationColumn: string;
  /** The sheet column holding the province's ID on its own tab. */
  provinceColumn: string;
  contacts: ContactSlot[];
  intervalMinutes: number;
};

/** The plain one-to-one fields. Everything else needs a transform. */
export const CUSTOMER_FIELDS = [
  { column: "code", label: "Customer code" },
  { column: "shop_name", label: "Shop name" },
  { column: "business_type", label: "Business type" },
  { column: "street_address", label: "Street address" },
  { column: "landmark", label: "Landmark" },
  { column: "province_text", label: "Province, as written" },
  { column: "district_text", label: "District, as written" },
  { column: "commune_text", label: "Commune, as written" },
  { column: "zipcode", label: "Zipcode" },
  { column: "remarks", label: "Remarks" },
] as const;

export type CustomerField = (typeof CUSTOMER_FIELDS)[number]["column"];

export type PlannedMap = {
  sheet_column: string;
  target_column: string;
  value_kind: "text" | "number";
  reference_table: string | null;
  transform: SyncTransform;
  transform_arg: string | null;
  sort_order: number;
};

export type PlannedSync = {
  name: string;
  target_table: string;
  require_column: string | null;
  maps: PlannedMap[];
};

const plain = (
  sheet_column: string,
  target_column: string,
  sort_order: number,
): PlannedMap => ({
  sheet_column,
  target_column,
  value_kind: "text",
  reference_table: null,
  transform: "none",
  transform_arg: null,
  sort_order,
});

/**
 * Everything the builder is about to create, in the order it will be created.
 *
 * The customers sync comes first because the contacts resolve their customer
 * through it. A contact whose customer has not been synced yet writes a null
 * link rather than failing, so getting the order wrong is recoverable — but
 * getting it right means one run instead of two.
 */
export function planCustomerSync(picks: CustomerSyncPicks): PlannedSync[] {
  const id = picks.sheetIdColumn.trim();
  const maps: PlannedMap[] = [];
  let order = 0;

  // The sheet's own ID, which is what makes a second run an update.
  maps.push(plain(id, "sheet_id", order++));

  for (const { column } of CUSTOMER_FIELDS) {
    const header = picks.fields[column]?.trim();
    if (header) maps.push(plain(header, column, order++));
  }

  if (picks.provinceColumn.trim()) {
    maps.push({
      ...plain(picks.provinceColumn.trim(), "province_code", order++),
      // The cell holds the province's ID on its own tab, not its code. Left
      // null when the provinces have not been synced yet.
      reference_table: "geo_provinces",
    });
  }

  if (picks.locationColumn.trim()) {
    const cell = picks.locationColumn.trim();
    maps.push({
      ...plain(cell, "latitude", order++),
      value_kind: "number",
      transform: "latitude",
    });
    maps.push({
      ...plain(cell, "longitude", order++),
      value_kind: "number",
      transform: "longitude",
    });
  }

  const planned: PlannedSync[] = [
    { name: "Customers", target_table: "customers", require_column: null, maps },
  ];

  picks.contacts.forEach((slot, i) => {
    const phone = slot.phone.trim();
    const label = slot.label.trim();
    // A slot with no phone column chosen is a slot nobody uses.
    if (!phone) return;

    const n = i + 1;
    planned.push({
      name: `Customer phone ${n}`,
      target_table: "customer_contacts",
      // A contact must be called something — the column is NOT NULL — so a row
      // whose label is blank is not a contact, and is left out rather than
      // failing the whole run.
      require_column: "name",
      maps: [
        {
          ...plain(id, "customer_id", 0),
          reference_table: "customers",
        },
        {
          ...plain(id, "sheet_id", 1),
          transform: "suffix",
          transform_arg: `#${n}`,
        },
        ...(label ? [plain(label, "name", 2)] : []),
        plain(phone, "phone", 3),
      ],
    });
  });

  return planned;
}

/** What is wrong with the picks, or null when nothing is. */
export function customerSyncProblem(picks: CustomerSyncPicks): string | null {
  if (!picks.spreadsheetId.trim()) return "Choose a spreadsheet.";
  if (!picks.tab.trim()) return "Choose the tab the customers are on.";
  if (!picks.sheetIdColumn.trim()) {
    return "Choose the column holding the customer's ID. Everything hangs off it.";
  }
  if (!picks.fields.shop_name?.trim()) {
    return "Choose the column holding the shop name. A customer must be called something.";
  }
  const slots = picks.contacts.filter((c) => c.phone.trim());
  if (slots.some((c) => !c.label.trim())) {
    return "Every phone needs the column that labels it: a contact must have a name.";
  }
  return null;
}

/** "One customer sync and three phone syncs" — what the button is about to do. */
export function planSummary(planned: PlannedSync[]): string {
  const phones = planned.length - 1;
  if (phones <= 0) return "One sync: customers.";
  return `${planned.length} syncs: customers, and ${phones} for the phones.`;
}
