import { describe, expect, it } from "vitest";
import {
  a1Range,
  buildRows,
  coerceValue,
  driveImagePrefix,
  extensionFor,
  fromMinutes,
  intervalLabel,
  isDue,
  kindForType,
  mappingLabel,
  nextRunAt,
  scheduleLabel,
  skipMessage,
  spreadsheetIdFrom,
  splitDriveReferences,
  syncProblems,
  toMinutes,
  matchColumn,
  type SyncColumnMap,
  type SyncDefinition,
  applyTransform,
  splitLatLng,
  withReferenceNamePrefix,
} from "./sync";

const map = (
  sheet_column: string,
  target_column: string | null,
  value_kind: SyncColumnMap["value_kind"] = "text",
  sort_order = 0,
  reference_table: string | null = null,
  transform: SyncColumnMap["transform"] = "none",
  transform_arg: string | null = null,
): SyncColumnMap => ({
  id: `m-${sheet_column}-${target_column ?? "none"}-${transform}`,
  sync_id: "s",
  sheet_column,
  target_column,
  value_kind,
  reference_table,
  transform,
  transform_arg,
  sort_order,
});

const sync = (over: Partial<SyncDefinition> = {}): SyncDefinition => ({
  id: "s",
  name: "Items",
  spreadsheet_id: "abc",
  tab_name: "Sheet1",
  header_row: 1,
  target_table: "items",
  trigger_kind: "interval",
  interval_minutes: 60,
  require_column: null,
  match_on: "sheet_id",
  hook_token: "t",
  active: true,
  last_run_at: null,
  next_run_at: null,
  ...over,
});

describe("spreadsheetIdFrom", () => {
  it("takes the id out of a pasted address", () => {
    expect(
      spreadsheetIdFrom(
        "https://docs.google.com/spreadsheets/d/1AbC-dEf_2345/edit#gid=87",
      ),
    ).toBe("1AbC-dEf_2345");
  });

  it("accepts a bare id", () => {
    expect(spreadsheetIdFrom("1AbCdEfGhIjKlMnOpQrStUv")).toBe("1AbCdEfGhIjKlMnOpQrStUv");
  });

  it("refuses something that is neither", () => {
    // A half-pasted URL stored as an id fails later, at the Google call, with a
    // message about a file that does not exist.
    expect(spreadsheetIdFrom("docs.google.com")).toBeNull();
    expect(spreadsheetIdFrom("   ")).toBeNull();
  });
});

describe("a1Range", () => {
  it("quotes the tab name", () => {
    expect(a1Range("Item List", 1)).toBe("'Item List'!A1:ZZ");
  });

  it("escapes a quote inside it", () => {
    expect(a1Range("Q1 'main'", 1)).toBe("'Q1 ''main'''!A1:ZZ");
  });

  it("starts at the heading row", () => {
    expect(a1Range("Sheet1", 3)).toBe("'Sheet1'!A3:ZZ");
  });
});

describe("coerceValue", () => {
  it("reads a number through its formatting", () => {
    // What a money column actually holds.
    expect(coerceValue("1,250.50", "number")).toBe(1250.5);
    expect(coerceValue("$12", "number")).toBe(12);
    expect(coerceValue("៛ 2,000", "number")).toBe(2000);
    expect(coerceValue("(45)", "number")).toBe(-45);
  });

  it("truncates rather than rounds for a whole number", () => {
    expect(coerceValue("12.9", "integer")).toBe(12);
  });

  it("reads the words people actually type for yes and no", () => {
    expect(coerceValue("Yes", "boolean")).toBe(true);
    expect(coerceValue("x", "boolean")).toBe(true);
    expect(coerceValue("no", "boolean")).toBe(false);
    expect(coerceValue("0", "boolean")).toBe(false);
  });

  it("reads a real date cell out of its serial number", () => {
    // 45000 is 2023-03-15 on the 1899-12-30 epoch Sheets uses.
    expect(coerceValue(45000, "date")).toBe("2023-03-15");
  });

  it("reads ISO text", () => {
    expect(coerceValue("2024-07-01", "date")).toBe("2024-07-01");
  });

  it("reads a written date day-first, as a Cambodian sheet means it", () => {
    expect(coerceValue("03/04/2024", "date")).toBe("2024-04-03");
  });

  it("gives null rather than a guess", () => {
    // A blank price is not a free item and an unreadable date is not today.
    expect(coerceValue("", "number")).toBeNull();
    expect(coerceValue("   ", "text")).toBeNull();
    expect(coerceValue("about twelve", "number")).toBeNull();
    expect(coerceValue("sometime", "date")).toBeNull();
    expect(coerceValue("maybe", "boolean")).toBeNull();
    expect(coerceValue(null, "text")).toBeNull();
  });
});

describe("buildRows", () => {
  const headers = ["Code", "Name", "Price", "Notes"];
  const maps = [
    map("Code", "code", "text", 0),
    map("Name", "name", "text", 1),
    map("Price", "price_usd", "number", 2),
    map("Notes", null, "text", 3),
  ];

  it("builds a record per row, from the mapping", () => {
    const built = buildRows(
      headers,
      [["HIG-1", "Water", "0.50", "ignore me"]],
      maps,
      "code",
    );
    expect(built.records).toEqual([
      { code: "HIG-1", name: "Water", price_usd: 0.5 },
    ]);
  });

  it("leaves a skipped column out entirely", () => {
    const built = buildRows(headers, [["HIG-1", "Water", "1", "x"]], maps, "code");
    expect(Object.keys(built.records[0])).not.toContain("Notes");
  });

  it("skips a row with no key, and says why", () => {
    // A sync that invents a key makes a duplicate on every run.
    const built = buildRows(
      headers,
      [["HIG-1", "Water", "1", ""], ["", "Orphan", "2", ""]],
      maps,
      "code",
    );
    expect(built.records).toHaveLength(1);
    expect(built.skipped).toBe(1);
    expect(skipMessage(built)).toBe("1 with no code");
  });

  it("skips a repeated key rather than letting Postgres refuse the whole batch", () => {
    const built = buildRows(
      headers,
      [["HIG-1", "Water", "1", ""], ["hig-1", "Water again", "2", ""]],
      maps,
      "code",
    );
    expect(built.records).toHaveLength(1);
    expect(skipMessage(built)).toBe("1 with code appears more than once");
  });

  it("passes over a blank row without counting it as skipped", () => {
    // Nobody meant it: it is the end of the data, or a gap in it.
    const built = buildRows(
      headers,
      [["HIG-1", "Water", "1", ""], ["", "", "", ""]],
      maps,
      "code",
    );
    expect(built.records).toHaveLength(1);
    expect(built.skipped).toBe(0);
    expect(built.read).toBe(1);
  });

  it("gives null for a mapped column the sheet no longer has", () => {
    const built = buildRows(["Code", "Name"], [["HIG-1", "Water"]], maps, "code");
    expect(built.records[0].price_usd).toBeNull();
  });

  it("takes the first of two columns with the same heading", () => {
    const built = buildRows(
      ["Code", "Code", "Name"],
      [["first", "second", "Water"]],
      [map("Code", "code"), map("Name", "name")],
      "code",
    );
    expect(built.records[0].code).toBe("first");
  });

  it("has nothing to build from an empty sheet", () => {
    expect(buildRows(headers, [], maps, "code").records).toEqual([]);
    expect(skipMessage(buildRows(headers, [], maps, "code"))).toBeNull();
  });
});

describe("the schedule", () => {
  it("turns a number and a unit into minutes", () => {
    expect(toMinutes(30, "minutes")).toBe(30);
    expect(toMinutes(2, "hours")).toBe(120);
    expect(toMinutes(1, "days")).toBe(1440);
  });

  it("reads minutes back in the largest unit that fits", () => {
    // So an edit screen opens on "every 2 hours", not "every 120 minutes".
    expect(fromMinutes(120)).toEqual({ every: 2, unit: "hours" });
    expect(fromMinutes(1440)).toEqual({ every: 1, unit: "days" });
    expect(fromMinutes(90)).toEqual({ every: 90, unit: "minutes" });
  });

  it("writes the interval the way somebody would say it", () => {
    expect(intervalLabel(60)).toBe("Every hour");
    expect(intervalLabel(120)).toBe("Every 2 hours");
    expect(intervalLabel(1440)).toBe("Every day");
    expect(intervalLabel(null)).toBe("—");
  });

  it("says plainly when a sync follows the sheet instead of a clock", () => {
    expect(scheduleLabel(sync({ trigger_kind: "change" }))).toBe(
      "When the sheet changes",
    );
  });

  it("counts the next run from when this one finished", () => {
    expect(nextRunAt(new Date("2026-01-01T10:00:00Z"), 90)).toBe(
      "2026-01-01T11:30:00.000Z",
    );
    expect(nextRunAt(new Date(), null)).toBeNull();
  });
});

describe("isDue", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("is due the moment it is past", () => {
    expect(isDue(sync({ next_run_at: "2026-01-01T11:59:00Z" }), now)).toBe(true);
    expect(isDue(sync({ next_run_at: "2026-01-01T12:01:00Z" }), now)).toBe(false);
  });

  it("is due immediately when it has never run", () => {
    // The first run is the one somebody is waiting for.
    expect(isDue(sync({ next_run_at: null }), now)).toBe(true);
  });

  it("is never due on a clock when the sheet is what says so", () => {
    expect(isDue(sync({ trigger_kind: "change", next_run_at: null }), now)).toBe(false);
  });

  it("is never due when it is switched off", () => {
    expect(isDue(sync({ active: false, next_run_at: null }), now)).toBe(false);
  });
});

describe("syncProblems", () => {
  const maps = [map("Code", "code"), map("Name", "name")];

  it("is happy with a mapping that includes the key", () => {
    expect(syncProblems({ trigger_kind: "interval", interval_minutes: 60 }, maps, "code"))
      .toEqual([]);
  });

  it("says so when nothing is mapped", () => {
    const problems = syncProblems(
      { trigger_kind: "change", interval_minutes: null },
      [map("Code", null)],
      "code",
    );
    expect(problems[0]).toContain("No sheet column is mapped");
  });

  it("says so when nothing feeds the key", () => {
    // Without it every run adds rows rather than updating them, which is the
    // one failure that quietly doubles a table every night.
    const problems = syncProblems(
      { trigger_kind: "change", interval_minutes: null },
      [map("Name", "name")],
      "code",
    );
    expect(problems.some((p) => p.includes("code"))).toBe(true);
  });

  it("says so when an interval sync has no interval", () => {
    const problems = syncProblems(
      { trigger_kind: "interval", interval_minutes: null },
      maps,
      "code",
    );
    expect(problems).toContain("An interval sync needs an interval.");
  });

  // The bug that prompted this check: a sheet's own id scheme sent straight
  // into a uuid column, which is not our id however much it looks like one.
  describe("a uuid column fed a sheet cell with nothing to resolve it", () => {
    const columns = [
      { column_name: "sheet_id", data_type: "text", is_required: false },
      { column_name: "parent_id", data_type: "uuid", is_required: false },
    ];

    it("is flagged when nothing marks it as a reference", () => {
      const problems = syncProblems(
        { trigger_kind: "interval", interval_minutes: 60 },
        [map("ID", "sheet_id"), map("Category ID", "parent_id")],
        "sheet_id",
        columns,
      );
      expect(problems.some((p) => p.includes("parent_id"))).toBe(true);
    });

    it("is not flagged once reference_table resolves it", () => {
      const problems = syncProblems(
        { trigger_kind: "interval", interval_minutes: 60 },
        [map("ID", "sheet_id"), map("Category ID", "parent_id", "text", 1, "item_categories")],
        "sheet_id",
        columns,
      );
      expect(problems.some((p) => p.includes("parent_id"))).toBe(false);
    });

    it("exempts the matched-on column itself", () => {
      // sheet_id is text, never uuid, but this proves the exemption rather
      // than the column's own type — a target keyed by its own id matches on
      // sheet_id for exactly this reason.
      const problems = syncProblems(
        { trigger_kind: "interval", interval_minutes: 60 },
        [map("ID", "sheet_id")],
        "sheet_id",
        columns,
      );
      expect(problems).toEqual([]);
    });

    it("says nothing when no column metadata was available to check against", () => {
      // The engine's own fetch of column types can itself fail; degrading to
      // the checks that do not need it is better than skipping validation
      // altogether, and better than a false alarm on every column.
      const problems = syncProblems(
        { trigger_kind: "interval", interval_minutes: 60 },
        [map("ID", "sheet_id"), map("Category ID", "parent_id")],
        "sheet_id",
      );
      expect(problems.some((p) => p.includes("parent_id"))).toBe(false);
    });
  });
});

describe("reading a sync back", () => {
  it("counts what is mapped against what the sheet has", () => {
    expect(mappingLabel([map("A", "code"), map("B", null), map("C", "name")]))
      .toBe("2 of 3 columns");
    expect(mappingLabel([])).toBe("Nothing mapped yet");
  });

  it("starts a mapping on the kind the column's type suggests", () => {
    expect(kindForType("numeric")).toBe("number");
    expect(kindForType("integer")).toBe("integer");
    expect(kindForType("boolean")).toBe("boolean");
    expect(kindForType("date")).toBe("date");
    expect(kindForType("timestamp with time zone")).toBe("timestamp");
    expect(kindForType("text")).toBe("text");
  });
});

describe("sheet IDs and references", () => {
  const target = { key_column: "code" };

  it("matches on the sheet's own ID by default", () => {
    // What the sheets link to each other by, and stable across a rename.
    expect(matchColumn({ match_on: "sheet_id" }, target)).toBe("sheet_id");
  });

  it("falls back to the natural key for a sheet with no ID column", () => {
    expect(matchColumn({ match_on: "natural" }, target)).toBe("code");
  });

  it("keeps a reference as the text the other sheet uses", () => {
    // The column it lands in holds a uuid, but what the sheet carries is that
    // row's ID. Coercing to the column's type here would turn an ID into null
    // before the database ever got to look it up.
    const built = buildRows(
      ["ID", "Category"],
      [["I-1", "C-9"]],
      [
        map("ID", "sheet_id", "text", 0),
        map("Category", "category_id", "integer", 1, "item_categories"),
      ],
      "sheet_id",
    );
    expect(built.records[0]).toEqual({ sheet_id: "I-1", category_id: "C-9" });
  });

  it("passes a reference through even when it looks like a number", () => {
    const built = buildRows(
      ["ID", "Cat"],
      [["I-1", 1042]],
      [map("ID", "sheet_id"), map("Cat", "category_id", "text", 1, "item_categories")],
      "sheet_id",
    );
    expect(built.records[0].category_id).toBe("1042");
  });

  it("skips a row with no sheet ID rather than inventing one", () => {
    const built = buildRows(
      ["ID", "Name"],
      [["I-1", "Water"], ["", "Orphan"]],
      [map("ID", "sheet_id"), map("Name", "name", "text", 1)],
      "sheet_id",
    );
    expect(built.records).toHaveLength(1);
    expect(skipMessage(built)).toBe("1 with no sheet_id");
  });

  it("wants something feeding the key it matches on", () => {
    const problems = syncProblems(
      { trigger_kind: "change", interval_minutes: null },
      [map("Name", "name")],
      "sheet_id",
    );
    expect(problems.some((p) => p.includes("sheet_id"))).toBe(true);
  });
});

describe("a sheet column that is two columns here", () => {
  it("splits a location cell into a pair", () => {
    expect(splitLatLng("11.5564, 104.9282")).toEqual({ lat: 11.5564, lng: 104.9282 });
  });

  it("takes the separators a column typed by hand actually holds", () => {
    expect(splitLatLng("11.5564,104.9282")).toEqual({ lat: 11.5564, lng: 104.9282 });
    expect(splitLatLng("  11.5564 ; 104.9282  ")).toEqual({ lat: 11.5564, lng: 104.9282 });
  });

  it("refuses half a coordinate rather than guessing the other half", () => {
    // Half a coordinate locates nothing, and the database has a constraint
    // saying so — guessing here would only move the failure.
    expect(splitLatLng("11.5564")).toBeNull();
    expect(splitLatLng("")).toBeNull();
    expect(splitLatLng(null)).toBeNull();
    expect(splitLatLng("somewhere near the market")).toBeNull();
  });

  it("refuses a pair that is not on the planet", () => {
    // Typed the wrong way round. A shop in the Gulf of Guinea is worse than a
    // shop with no pin at all.
    expect(splitLatLng("104.9282, 11.5564")).toBeNull();
  });

  it("writes one cell into two columns, from two mappings", () => {
    // The bug this fixes: mappings used to be keyed by sheet column, so a
    // second mapping of the same column replaced the first and one half of
    // every location was silently dropped.
    const built = buildRows(
      ["Code", "Pin"],
      [["C-1", "11.5564, 104.9282"]],
      [
        map("Code", "code"),
        map("Pin", "latitude", "number", 1, null, "latitude"),
        map("Pin", "longitude", "number", 2, null, "longitude"),
      ],
      "code",
    );

    expect(built.records).toEqual([
      { code: "C-1", latitude: 11.5564, longitude: 104.9282 },
    ]);
  });

  it("leaves both halves null when the cell is unusable", () => {
    const built = buildRows(
      ["Code", "Pin"],
      [["C-1", "not a pin"]],
      [
        map("Code", "code"),
        map("Pin", "latitude", "number", 1, null, "latitude"),
        map("Pin", "longitude", "number", 2, null, "longitude"),
      ],
      "code",
    );

    expect(built.records[0]).toEqual({ code: "C-1", latitude: null, longitude: null });
  });
});

describe("contacts that live in the customer's row", () => {
  const contactMaps = [
    // The customer this contact belongs to, resolved through its sheet id.
    map("Customer ID", "customer_id", "text", 0, "customers"),
    // Its own identity, derived from the parent's: contact one is always
    // contact one, so a second run rewrites it rather than adding it again.
    map("Customer ID", "sheet_id", "text", 1, null, "suffix", "#1"),
    map("Contact 1 Name", "name", "text", 2),
    map("Contact 1 Phone", "phone", "text", 3),
  ];

  it("gives the child a stable id derived from its parent", () => {
    const built = buildRows(
      ["Customer ID", "Contact 1 Name", "Contact 1 Phone"],
      [["CUS-7", "Sok Dara", "012345678"]],
      contactMaps,
      "sheet_id",
    );

    expect(built.records).toEqual([
      { customer_id: "CUS-7", sheet_id: "CUS-7#1", name: "Sok Dara", phone: "012345678" },
    ]);
  });

  it("leaves out the slot nobody filled in", () => {
    // The synthesised id is there whether or not the contact is, so the key
    // check cannot tell the difference. require_column can.
    const built = buildRows(
      ["Customer ID", "Contact 1 Name", "Contact 1 Phone"],
      [
        ["CUS-7", "Sok Dara", "012345678"],
        ["CUS-8", "", ""],
      ],
      contactMaps,
      "sheet_id",
      "name",
    );

    expect(built.records).toHaveLength(1);
    expect(built.records[0].sheet_id).toBe("CUS-7#1");
    // Not counted as a skip: nobody meant to enter a second contact.
    expect(built.skipped).toBe(0);
  });

  it("has no identity to give when the parent has none", () => {
    expect(applyTransform("suffix", "#1", "", null)).toBeNull();
    expect(applyTransform("suffix", "#1", null, null)).toBeNull();
  });

  it("keeps two slots apart", () => {
    expect(applyTransform("suffix", "#1", "CUS-7", "CUS-7")).toBe("CUS-7#1");
    expect(applyTransform("suffix", "#2", "CUS-7", "CUS-7")).toBe("CUS-7#2");
  });
});

describe("a mapping with nothing to do", () => {
  it("hands back what the column's own type made of the cell", () => {
    expect(applyTransform("none", null, "12", 12)).toBe(12);
  });
});

describe("a column the sheet leaves blank", () => {
  it("keeps what somebody wrote", () => {
    expect(applyTransform("fallback", "Phone 1", "Owner", "Owner")).toBe("Owner");
  });

  it("and stands in for them where they wrote nothing", () => {
    expect(applyTransform("fallback", "Phone 1", "", null)).toBe("Phone 1");
    expect(applyTransform("fallback", "Phone 1", "   ", null)).toBe("Phone 1");
    expect(applyTransform("fallback", "Phone 1", null, null)).toBe("Phone 1");
  });

  // Without this the constraint would be the only thing catching it, and only
  // once somebody had already saved the mapping.
  it("is nothing at all without the text it carries", () => {
    expect(applyTransform("fallback", null, "", null)).toBeNull();
  });
});

describe("a picture column that is really a Drive link", () => {
  it("is handed through as trimmed text, for splitDriveReferences to find later", () => {
    expect(applyTransform("drive_image", null, "  1AbC-XyZ  ", "1AbC-XyZ")).toBe("1AbC-XyZ");
  });

  it("is nothing when the cell is empty", () => {
    expect(applyTransform("drive_image", null, "", null)).toBeNull();
    expect(applyTransform("drive_image", null, null, null)).toBeNull();
  });
});

describe("splitDriveReferences", () => {
  const maps = [
    map("Category ID", "sheet_id", "text", 0),
    map("Name", "name_en", "text", 1),
    map("Picture", "photo_path", "text", 2, null, "drive_image"),
  ];

  it("pulls the drive_image column out of every row, keyed by the match column", () => {
    const records = [
      { sheet_id: "C1", name_en: "Snacks", photo_path: "https://drive.google.com/file/d/abc123/view" },
      { sheet_id: "C2", name_en: "Drinks", photo_path: "  " }, // blank after trimming
    ];

    const { rows, references } = splitDriveReferences(records, maps, "sheet_id");

    // The column is gone from what still goes to sync_apply — that function
    // has no idea what a Drive link is and must never be handed one.
    expect(rows).toEqual([
      { sheet_id: "C1", name_en: "Snacks" },
      { sheet_id: "C2", name_en: "Drinks" },
    ]);
    expect(references).toEqual([
      { key: "C1", column: "photo_path", reference: "https://drive.google.com/file/d/abc123/view" },
    ]);
  });

  it("does nothing when no column is mapped as drive_image", () => {
    const plainMaps = [map("Name", "name_en", "text", 0)];
    const records = [{ name_en: "Snacks" }];
    expect(splitDriveReferences(records, plainMaps, "name_en")).toEqual({
      rows: records,
      references: [],
    });
  });

  it("leaves a non-string cell alone rather than treating it as a reference", () => {
    const records = [{ sheet_id: "C1", name_en: "Snacks", photo_path: 42 }];
    const { rows, references } = splitDriveReferences(records, maps, "sheet_id");
    expect(rows).toEqual([{ sheet_id: "C1", name_en: "Snacks" }]);
    expect(references).toEqual([]);
  });
});

describe("driveImagePrefix", () => {
  it("matches the folder the category screen itself already uploads to", () => {
    expect(driveImagePrefix("item_categories")).toBe("categories");
  });

  it("falls back to the table's own name for anything else", () => {
    expect(driveImagePrefix("item_variants")).toBe("item_variants");
  });
});

describe("extensionFor", () => {
  it("reads the common image types Drive serves", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("image/heic")).toBe("heic");
  });

  it("ignores a trailing charset", () => {
    expect(extensionFor("image/png; charset=binary")).toBe("png");
  });

  it("falls back to jpg for anything it does not recognise", () => {
    expect(extensionFor("application/octet-stream")).toBe("jpg");
    expect(extensionFor("")).toBe("jpg");
  });
});

describe("an item name meant to carry its category too", () => {
  it("is handed through as the plain coerced value — the prefixing happens later", () => {
    expect(applyTransform("reference_name_prefix", null, "Coca Cola", "Coca Cola")).toBe(
      "Coca Cola",
    );
  });
});

describe("withReferenceNamePrefix", () => {
  const maps = [
    map("ID", "sheet_id", "text", 0),
    map("ITEM_ID", "category_id", "text", 1, "item_categories"),
    map("NAME", "name", "text", 2, null, "reference_name_prefix"),
  ];

  it("prepends the referenced row's own name to the cell's own text", () => {
    const records = [{ sheet_id: "I1", category_id: "C1", name: "Coca Cola" }];
    const names = new Map([["C1", "Beverages"]]);
    expect(withReferenceNamePrefix(records, maps, names)).toEqual([
      { sheet_id: "I1", category_id: "C1", name: "Beverages Coca Cola" },
    ]);
  });

  it("leaves the cell as the sheet wrote it when the reference has not resolved", () => {
    // The parent may simply not be synced yet — the same leniency a
    // reference always gets elsewhere in this file.
    const records = [{ sheet_id: "I1", category_id: "C9", name: "Coca Cola" }];
    expect(withReferenceNamePrefix(records, maps, new Map())).toEqual(records);
  });

  it("does nothing when no column asks for the prefix", () => {
    const plainMaps = [map("NAME", "name")];
    const records = [{ name: "Coca Cola" }];
    expect(withReferenceNamePrefix(records, plainMaps, new Map([["C1", "Beverages"]]))).toBe(
      records,
    );
  });

  it("does nothing when nothing in the sync resolves a reference to prefix with", () => {
    const noRefMaps = [map("NAME", "name", "text", 0, null, "reference_name_prefix")];
    const records = [{ name: "Coca Cola" }];
    expect(withReferenceNamePrefix(records, noRefMaps, new Map([["C1", "Beverages"]]))).toEqual(
      records,
    );
  });

  it("re-runs cleanly from the sheet's own text rather than doubling the prefix", () => {
    // `own` always comes from buildRows' coercion of the sheet cell, never
    // from a name a previous run already prefixed, so a second run starts
    // fresh instead of compounding.
    const records = [{ sheet_id: "I1", category_id: "C1", name: "Coca Cola" }];
    const names = new Map([["C1", "Beverages"]]);
    const once = withReferenceNamePrefix(records, maps, names);
    const again = withReferenceNamePrefix(records, maps, names);
    expect(again).toEqual(once);
  });
});

describe("syncProblems: a prefix with nothing to resolve it against", () => {
  it("is flagged when no column in the sync resolves a reference", () => {
    const problems = syncProblems(
      { trigger_kind: "interval", interval_minutes: 60 },
      [map("ID", "sheet_id"), map("NAME", "name", "text", 1, null, "reference_name_prefix")],
      "sheet_id",
    );
    expect(problems.some((p) => p.includes("reference"))).toBe(true);
  });

  it("is not flagged once some column does resolve one", () => {
    const problems = syncProblems(
      { trigger_kind: "interval", interval_minutes: 60 },
      [
        map("ID", "sheet_id"),
        map("ITEM_ID", "category_id", "text", 1, "item_categories"),
        map("NAME", "name", "text", 2, null, "reference_name_prefix"),
      ],
      "sheet_id",
    );
    expect(problems.some((p) => p.toLowerCase().includes("reference to get"))).toBe(false);
  });
});
