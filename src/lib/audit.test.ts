import { describe, expect, it } from "vitest";
import {
  actionLabel,
  actionTone,
  actorLabel,
  AUDIT_ACTIONS,
  changeRows,
  columnLabel,
  dayKey,
  dayLabel,
  describeEntry,
  filterEntries,
  formatValue,
  groupByDay,
  matchesEntry,
  recordTitle,
  tableLabel,
  tablesIn,
  timeOf,
  type AuditEntry,
} from "./audit";

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1,
  // 08:30 in Phnom Penh, which is 01:30 UTC — the gap is the point of several
  // of the tests below.
  occurred_at: "2026-09-03T01:30:00Z",
  actor_id: "u1",
  actor_name: "Sokha",
  table_name: "items",
  record_id: "i1",
  action: "update",
  changed: ["price_usd"],
  old_row: { id: "i1", name_en: "Drinking Water", price_usd: 0.5 },
  new_row: { id: "i1", name_en: "Drinking Water", price_usd: 0.6 },
  ...over,
});

describe("tableLabel", () => {
  it("names the tables this app actually has", () => {
    expect(tableLabel("item_variants")).toBe("Variant");
    expect(tableLabel("users")).toBe("Employee");
    expect(tableLabel("user_permission_overrides")).toBe("Permission override");
  });

  it("makes a readable guess at one added later", () => {
    // A table added by a future migration should still read as words rather
    // than leaking the schema onto the screen.
    expect(tableLabel("delivery_notes")).toBe("Delivery notes");
  });
});

describe("columnLabel", () => {
  it("spells out the ones a person would not recognise", () => {
    expect(columnLabel("name_km")).toBe("Name (Khmer)");
    expect(columnLabel("is_primary")).toBe("Main");
    expect(columnLabel("photo_path")).toBe("Picture");
  });

  it("falls back to the column as words", () => {
    expect(columnLabel("street_address")).toBe("Street address");
  });
});

describe("actionLabel / actionTone", () => {
  it("says what happened in the words a person would use", () => {
    expect(actionLabel("insert")).toBe("Created");
    expect(actionLabel("update")).toBe("Changed");
    expect(actionLabel("delete")).toBe("Removed");
  });

  it("colours removal apart from the other two", () => {
    expect(actionTone("delete")).toBe("danger");
    expect(actionTone("insert")).not.toBe("danger");
    expect(actionTone("update")).not.toBe("danger");
  });

  it("offers All first, then the three in the order they happen", () => {
    expect(AUDIT_ACTIONS.map((a) => a.value)).toEqual([
      "all",
      "insert",
      "update",
      "delete",
    ]);
  });
});

describe("actorLabel", () => {
  it("names the person who did it", () => {
    expect(actorLabel(entry())).toBe("Sokha");
  });

  it("calls an unattributed change what it is", () => {
    // A migration, a script, or the trigger that creates a user row at sign-up.
    expect(actorLabel(entry({ actor_name: null, actor_id: null }))).toBe("System");
    expect(actorLabel(entry({ actor_name: "   " }))).toBe("System");
  });
});

describe("recordTitle", () => {
  it("reads the record's own name rather than its key", () => {
    expect(recordTitle(entry())).toBe("Drinking Water");
    expect(recordTitle(entry({ table_name: "users", new_row: { full_name: "Dara" } }))).toBe(
      "Dara",
    );
    expect(
      recordTitle(entry({ table_name: "customers", new_row: { shop_name: "Dara Mart" } })),
    ).toBe("Dara Mart");
  });

  it("finds the name on a deletion, where only the old row still has it", () => {
    expect(
      recordTitle(
        entry({ action: "delete", new_row: null, old_row: { name_en: "Old Stock" } }),
      ),
    ).toBe("Old Stock");
  });

  it("falls back to the key when a record has nothing it calls itself", () => {
    expect(
      recordTitle(
        entry({ record_id: "r1 / inventory / view", new_row: { scope: "any" } }),
      ),
    ).toBe("r1 / inventory / view");
  });

  it("ignores a name that is only whitespace", () => {
    expect(recordTitle(entry({ new_row: { name_en: "  ", id: "i1" } }))).toBe("i1");
  });
});

describe("describeEntry", () => {
  it("puts what happened, to what kind of thing, and which one on one line", () => {
    expect(describeEntry(entry())).toBe("Changed Item — Drinking Water");
  });
});

describe("formatValue", () => {
  it("tells an empty field from a blank one", () => {
    // Not pedantry: "somebody cleared this" and "nobody ever filled it in" are
    // different events, and this screen exists to tell them apart.
    expect(formatValue(null)).toBe("empty");
    expect(formatValue(undefined)).toBe("empty");
    expect(formatValue("")).toBe("blank");
    expect(formatValue("   ")).toBe("blank");
  });

  it("writes a boolean as an answer rather than as a value", () => {
    expect(formatValue(true)).toBe("Yes");
    expect(formatValue(false)).toBe("No");
  });

  it("keeps a number and a string as they are", () => {
    expect(formatValue(0.6)).toBe("0.6");
    expect(formatValue(0)).toBe("0");
    expect(formatValue("Drinking Water")).toBe("Drinking Water");
  });

  it("reads an array out rather than showing brackets", () => {
    expect(formatValue(["a", "b"])).toBe("a, b");
    expect(formatValue([])).toBe("none");
  });
});

describe("changeRows", () => {
  it("lists what moved on an update, from and to", () => {
    expect(changeRows(entry())).toEqual([
      { column: "price_usd", label: "Price USD", from: "0.5", to: "0.6" },
    ]);
  });

  it("lists what a created record held, on the arriving side", () => {
    const rows = changeRows(
      entry({
        action: "insert",
        changed: [],
        old_row: null,
        new_row: { id: "i1", name_en: "Water", price_usd: 0.5, name_km: null },
      }),
    );
    expect(rows.map((r) => r.column)).toEqual(["name_en", "price_usd"]);
    expect(rows[0]).toEqual({ column: "name_en", label: "Name (English)", from: "", to: "Water" });
  });

  it("lists what a removed record held, on the leaving side", () => {
    const rows = changeRows(
      entry({
        action: "delete",
        changed: [],
        new_row: null,
        old_row: { id: "i1", name_en: "Water" },
      }),
    );
    expect(rows).toEqual([
      { column: "name_en", label: "Name (English)", from: "Water", to: "" },
    ]);
  });

  it("leaves out the housekeeping columns", () => {
    // The key never changes, and the timestamps repeat what the entry's own
    // time already says.
    const rows = changeRows(
      entry({
        action: "insert",
        old_row: null,
        new_row: { id: "i1", created_at: "x", updated_at: "y", name_en: "Water" },
      }),
    );
    expect(rows.map((r) => r.column)).toEqual(["name_en"]);
  });

  it("leaves them out of an update too", () => {
    const rows = changeRows(entry({ changed: ["updated_at", "price_usd"] }));
    expect(rows.map((r) => r.column)).toEqual(["price_usd"]);
  });

  it("has nothing to show when a row was not stored", () => {
    expect(changeRows(entry({ action: "delete", old_row: null, new_row: null }))).toEqual([]);
  });
});

describe("matchesEntry / filterEntries", () => {
  const rows = [
    entry({ id: 1, actor_name: "Sokha", table_name: "items", action: "update" }),
    entry({
      id: 2,
      actor_name: "Dara",
      table_name: "customers",
      action: "insert",
      changed: [],
      old_row: null,
      new_row: { shop_name: "Dara Mart" },
    }),
    entry({
      id: 3,
      actor_name: null,
      table_name: "users",
      action: "delete",
      changed: [],
      new_row: null,
      old_row: { full_name: "Vanna" },
    }),
  ];

  it("matches everything on an empty query", () => {
    expect(matchesEntry(rows[0], "")).toBe(true);
    expect(matchesEntry(rows[0], "   ")).toBe(true);
  });

  it("matches the person, the record, the kind of record and the field", () => {
    expect(matchesEntry(rows[0], "sokha")).toBe(true);
    expect(matchesEntry(rows[0], "drinking")).toBe(true);
    expect(matchesEntry(rows[0], "item")).toBe(true);
    expect(matchesEntry(rows[0], "price usd")).toBe(true);
  });

  it("finds an unattributed change by searching for System", () => {
    expect(matchesEntry(rows[2], "system")).toBe(true);
  });

  it("does not match something absent", () => {
    expect(matchesEntry(rows[0], "cement")).toBe(false);
  });

  it("narrows by what happened and by the kind of record, together", () => {
    expect(filterEntries(rows, "", "all", "all").map((e) => e.id)).toEqual([1, 2, 3]);
    expect(filterEntries(rows, "", "delete", "all").map((e) => e.id)).toEqual([3]);
    expect(filterEntries(rows, "", "all", "customers").map((e) => e.id)).toEqual([2]);
    expect(filterEntries(rows, "dara", "insert", "customers").map((e) => e.id)).toEqual([2]);
    expect(filterEntries(rows, "dara", "delete", "all")).toEqual([]);
  });
});

describe("tablesIn", () => {
  it("lists each kind once, in the order the labels read", () => {
    const names = tablesIn([
      entry({ table_name: "items" }),
      entry({ table_name: "customers" }),
      entry({ table_name: "items" }),
      entry({ table_name: "brands" }),
    ]);
    // Brand, Customer, Item — by label, not by table name.
    expect(names).toEqual(["brands", "customers", "items"]);
  });
});

describe("dayKey / timeOf", () => {
  it("reads an instant in Cambodian time, not the machine's", () => {
    // 01:30 UTC is 08:30 the same morning in Phnom Penh.
    expect(dayKey("2026-09-03T01:30:00Z")).toBe("2026-09-03");
    expect(timeOf("2026-09-03T01:30:00Z")).toBe("08:30");
  });

  it("puts a late-evening UTC instant on the next Cambodian day", () => {
    // 18:00 UTC on the 2nd is 01:00 on the 3rd in Phnom Penh. Formatting this
    // from the server's own zone is exactly how a log ends up with an entry
    // filed under the wrong day.
    expect(dayKey("2026-09-02T18:00:00Z")).toBe("2026-09-03");
    expect(timeOf("2026-09-02T18:00:00Z")).toBe("01:00");
  });
});

describe("dayLabel", () => {
  const now = new Date("2026-09-03T05:00:00Z"); // midday in Phnom Penh

  it("names the two days a person thinks of by name", () => {
    expect(dayLabel("2026-09-03", now)).toBe("Today");
    expect(dayLabel("2026-09-02", now)).toBe("Yesterday");
  });

  it("writes any other day out in full", () => {
    expect(dayLabel("2026-08-30", now)).toBe("Sunday, 30 August 2026");
  });
});

describe("groupByDay", () => {
  const now = new Date("2026-09-03T05:00:00Z");

  it("cuts the list into days without reordering it", () => {
    const days = groupByDay(
      [
        entry({ id: 1, occurred_at: "2026-09-03T03:00:00Z" }),
        entry({ id: 2, occurred_at: "2026-09-03T01:00:00Z" }),
        entry({ id: 3, occurred_at: "2026-09-01T23:00:00Z" }),
      ],
      now,
    );
    expect(days.map((d) => d.label)).toEqual(["Today", "Yesterday"]);
    expect(days[0].entries.map((e) => e.id)).toEqual([1, 2]);
    // 23:00 UTC on the 1st is 06:00 on the 2nd in Phnom Penh: yesterday.
    expect(days[1].entries.map((e) => e.id)).toEqual([3]);
  });

  it("starts a new heading each time the day changes, even if it comes back", () => {
    // The database decides the order; this only cuts it. An entry must never
    // move relative to another because of how it was grouped.
    const days = groupByDay(
      [
        entry({ id: 1, occurred_at: "2026-09-03T03:00:00Z" }),
        entry({ id: 2, occurred_at: "2026-09-01T03:00:00Z" }),
        entry({ id: 3, occurred_at: "2026-09-03T02:00:00Z" }),
      ],
      now,
    );
    expect(days.map((d) => d.entries.map((e) => e.id))).toEqual([[1], [2], [3]]);
  });

  it("has nothing to group when the filter matched nothing", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
