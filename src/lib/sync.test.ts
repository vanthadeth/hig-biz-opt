import { describe, expect, it } from "vitest";
import {
  a1Range,
  buildRows,
  coerceValue,
  fromMinutes,
  intervalLabel,
  isDue,
  kindForType,
  mappingLabel,
  nextRunAt,
  scheduleLabel,
  skipMessage,
  spreadsheetIdFrom,
  syncProblems,
  toMinutes,
  type SyncColumnMap,
  type SyncDefinition,
} from "./sync";

const map = (
  sheet_column: string,
  target_column: string | null,
  value_kind: SyncColumnMap["value_kind"] = "text",
  sort_order = 0,
): SyncColumnMap => ({
  id: `m-${sheet_column}`,
  sync_id: "s",
  sheet_column,
  target_column,
  value_kind,
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
    map("Name", "name_en", "text", 1),
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
      { code: "HIG-1", name_en: "Water", price_usd: 0.5 },
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
      [map("Code", "code"), map("Name", "name_en")],
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
  const maps = [map("Code", "code"), map("Name", "name_en")];

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
      [map("Name", "name_en")],
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
});

describe("reading a sync back", () => {
  it("counts what is mapped against what the sheet has", () => {
    expect(mappingLabel([map("A", "code"), map("B", null), map("C", "name_en")]))
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
