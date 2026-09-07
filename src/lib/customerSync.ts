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
  /** The sheet column that says which province. */
  provinceColumn: string;
  /**
   * Whether that column already holds the province's own code.
   *
   * Two sheets say "province" two ways: one writes the code this database
   * keys provinces by ("SRP"), the other writes the ID the province has on
   * its own tab, which has to be looked up. Guessing wrong is expensive and
   * silent — every customer lands with no province at all — so this is
   * decided by comparing the column's real values against the province list
   * rather than by assuming.
   */
  provinceIsCode: boolean;
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
      // A column that already holds the code is written straight through. One
      // that holds the province's ID on its own tab is looked up, and lands
      // null while the provinces have not been synced yet.
      reference_table: picks.provinceIsCode ? null : "geo_provinces",
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
      // What makes a slot used is the number in it, not the label beside it.
      // Most labels on a sheet like this are blank, and treating a blank one as
      // an empty slot threw away two thirds of the phone numbers.
      require_column: "phone",
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
        // A contact must be called something — the column is NOT NULL — and
        // the label column is where that something comes from when the sheet
        // has one. Where it does not, "Phone 2" is a worse name than the real
        // one and a much better answer than dropping the number.
        ...(label
          ? [{ ...plain(label, "name", 2), transform: "fallback" as const, transform_arg: `Phone ${n}` }]
          : []),
        plain(phone, "phone", 3),
      ],
    });
  });

  return planned;
}

// Reading the sheet's own headers --------------------------------------------------------

/**
 * A header reduced to what it is trying to say.
 *
 * Underscores, slashes, case and stray punctuation are how one person writes
 * "LAT/LONG" and another writes "Lat Long". None of it identifies anything.
 */
export function headerKey(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The headers a target answers to, and only those.
 *
 * Matched whole, never by containment. "BIZ_TYPE_2" is not the business type
 * and "PH1L" is not the first phone, and a substring rule that got either
 * wrong would put the mistake in a column somebody has to notice rather than
 * in an empty box they cannot miss. A header nobody claims stays unmapped and
 * is chosen by hand — a confident guess or none.
 */
const FIELD_HEADERS: { field: CustomerField; headers: string[] }[] = [
  { field: "shop_name", headers: ["name", "shop name", "customer name", "shop"] },
  { field: "business_type", headers: ["biz type", "business type"] },
  { field: "street_address", headers: ["street", "street address", "address"] },
  { field: "landmark", headers: ["landmark"] },
  { field: "province_text", headers: ["province", "province name"] },
  { field: "district_text", headers: ["district", "district name"] },
  { field: "commune_text", headers: ["commune", "commune name"] },
  { field: "zipcode", headers: ["zipcode", "zip code", "zip", "postal code", "postcode"] },
  { field: "remarks", headers: ["remarks", "remark", "note", "notes"] },
];

const ID_HEADERS = ["id", "customer id", "cus id", "sheet id"];
const PROVINCE_ID_HEADERS = ["province id", "province code"];
const LOCATION_HEADERS = [
  "lat long", "lat lng", "latlong", "latitude longitude",
  "gps", "location", "coordinate", "coordinates",
];

const phoneHeaders = (n: number) => [`ph${n}`, `phone ${n}`, `phone${n}`, `tel ${n}`, `tel${n}`];
const labelHeaders = (n: number) => [`ph${n}l`, `ph${n} label`, `phone ${n} label`, `label ${n}`];

/**
 * Everything this sheet's headers already say, filled in.
 *
 * The point of the customer builder was never to ask thirty questions; it was
 * to say the two things an ordinary mapping cannot — a location in one cell,
 * and three phones in the customer's row. The rest is a spreadsheet naming its
 * own columns, and reading them is work for the machine.
 *
 * The customer code is deliberately never guessed. It is unique in this
 * database, sheets carry compound identifiers in columns that look like codes,
 * and a wrong guess fails the whole run on a duplicate key rather than leaving
 * one field empty.
 */
export function guessPicks(headers: string[]): Pick<
  CustomerSyncPicks,
  "sheetIdColumn" | "fields" | "locationColumn" | "provinceColumn" | "contacts"
> {
  const byKey = new Map<string, string>();
  for (const header of headers) {
    const key = headerKey(header);
    // First wins, matching how the row builder reads a sheet with a repeated
    // column name.
    if (key !== "" && !byKey.has(key)) byKey.set(key, header);
  }

  const taken = new Set<string>();
  const claim = (candidates: string[]): string => {
    for (const candidate of candidates) {
      const header = byKey.get(candidate);
      if (header !== undefined && !taken.has(header)) {
        taken.add(header);
        return header;
      }
    }
    return "";
  };

  // The province's own ID first: "PROVINCE_ID" must not be claimed as the
  // written province name by a looser rule further down.
  const provinceColumn = claim(PROVINCE_ID_HEADERS);
  const sheetIdColumn = claim(ID_HEADERS);

  const fields: Partial<Record<CustomerField, string>> = {};
  for (const { field, headers: candidates } of FIELD_HEADERS) {
    const found = claim(candidates);
    if (found) fields[field] = found;
  }

  const contacts: ContactSlot[] = [1, 2, 3].map((n) => ({
    phone: claim(phoneHeaders(n)),
    label: claim(labelHeaders(n)),
  }));

  return {
    sheetIdColumn,
    fields,
    locationColumn: claim(LOCATION_HEADERS),
    provinceColumn,
    contacts,
  };
}

/**
 * Whether the province column holds codes this database already knows.
 *
 * Read off the sheet's own sample rows rather than assumed, because the two
 * readings fail in opposite directions and one of them fails silently: a
 * column of codes treated as IDs looks up nothing and leaves every customer
 * with no province at all.
 *
 * A majority is enough. Sheets have blanks and a stray typo, and demanding
 * every value match would send a whole column down the wrong path for one bad
 * cell.
 */
export function looksLikeProvinceCodes(values: unknown[], codes: string[]): boolean {
  const known = new Set(codes.map((code) => code.trim().toLowerCase()));
  const seen = values
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter((value) => value !== "");

  if (seen.length === 0 || known.size === 0) return false;
  return seen.filter((value) => known.has(value)).length * 2 > seen.length;
}

/** "Ten of thirty-three columns matched" — what the screen says about a guess. */
export function guessSummary(
  picks: Pick<
    CustomerSyncPicks,
    "sheetIdColumn" | "fields" | "locationColumn" | "provinceColumn" | "contacts"
  >,
  headers: string[],
): string {
  const used = new Set(
    [
      picks.sheetIdColumn,
      picks.locationColumn,
      picks.provinceColumn,
      ...Object.values(picks.fields),
      ...picks.contacts.flatMap((slot) => [slot.phone, slot.label]),
    ].filter((header): header is string => Boolean(header)),
  );

  if (used.size === 0) return "None of these headers is one I recognise. Choose them below.";
  return `Filled in from ${used.size} of the sheet's ${headers.length} columns. Check them, and choose anything left over.`;
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
    // The column, not a value in it: blank cells inside a chosen label column
    // are fine and fall back to "Phone 1". Having no label column at all is
    // not, because then nothing feeds a NOT NULL column.
    return "Every phone needs the column that labels it, even if most of its cells are empty.";
  }
  return null;
}

/** "One customer sync and three phone syncs" — what the button is about to do. */
export function planSummary(planned: PlannedSync[]): string {
  const phones = planned.length - 1;
  if (phones <= 0) return "One sync: customers.";
  return `${planned.length} syncs: customers, and ${phones} for the phones.`;
}
