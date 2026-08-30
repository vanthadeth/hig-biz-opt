import { describe, expect, it } from "vitest";
import {
  countPeople,
  displayName,
  groupByDepartment,
  initials,
  formatDate,
  matches,
  profileGroups,
  statusChange,
  statusProblem,
  telegramHref,
  type Department,
  type DirectoryEntry,
  type UserRecord,
} from "./users";

const SALES: Department = { id: "d1", name: "Sales", sort_order: 1 };
const ACCOUNTING: Department = { id: "d2", name: "Accounting", sort_order: 2 };
const HR: Department = { id: "d3", name: "HR", sort_order: 3 };
const DEPARTMENTS = [SALES, ACCOUNTING, HR];

function person(over: Partial<DirectoryEntry> & { id: string; full_name: string }): DirectoryEntry {
  return {
    nickname: null,
    position: null,
    department_id: null,
    status: "active",
    photo_path: null,
    ...over,
  };
}

const PEOPLE = [
  person({ id: "1", full_name: "Sokha Chan", nickname: "Dara", position: "Sales Supervisor", department_id: "d1" }),
  person({ id: "2", full_name: "Bopha Lim", position: "Sales Rep", department_id: "d1" }),
  person({ id: "3", full_name: "Vichea Sok", position: "Accountant", department_id: "d2", status: "suspended" }),
  person({ id: "4", full_name: "Rithy Nou", position: "Driver" }),
];

describe("displayName", () => {
  it("puts the nickname in brackets after the name", () => {
    expect(displayName({ full_name: "Sokha Chan", nickname: "Dara" })).toBe(
      "Sokha Chan (Dara)",
    );
  });

  it("is just the name when there is no nickname", () => {
    expect(displayName({ full_name: "Bopha Lim", nickname: null })).toBe("Bopha Lim");
  });

  it("treats a whitespace-only nickname as absent", () => {
    // A stray space typed into an optional field should not render as "().
    expect(displayName({ full_name: "Bopha Lim", nickname: "  " })).toBe("Bopha Lim");
  });
});

describe("initials", () => {
  it("takes the first and last name", () => {
    expect(initials("Sokha Chan")).toBe("SC");
    expect(initials("Mary Anne Watson")).toBe("MW");
  });

  it("takes two letters from a single name", () => {
    expect(initials("Cher")).toBe("CH");
  });

  it("survives an empty name rather than rendering nothing", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("matches", () => {
  const sokha = PEOPLE[0];

  it("matches on name, nickname and position", () => {
    expect(matches(sokha, "sokha")).toBe(true);
    expect(matches(sokha, "dara")).toBe(true);
    expect(matches(sokha, "supervisor")).toBe(true);
  });

  it("ignores case and surrounding space", () => {
    expect(matches(sokha, "  SOKHA  ")).toBe(true);
  });

  it("matches everyone on an empty query", () => {
    // An empty search box is not a filter that excludes the whole company.
    expect(matches(sokha, "")).toBe(true);
    expect(matches(sokha, "   ")).toBe(true);
  });

  it("does not match something absent", () => {
    expect(matches(sokha, "warehouse")).toBe(false);
  });

  it("does not fall over on a person with nothing filled in", () => {
    expect(matches(person({ id: "x", full_name: "Nobody" }), "rep")).toBe(false);
  });
});

describe("groupByDepartment", () => {
  it("orders departments by their configured order, not alphabetically", () => {
    const groups = groupByDepartment(PEOPLE, DEPARTMENTS);

    expect(groups.map((g) => g.name)).toEqual(["Sales", "Accounting", "Unassigned"]);
  });

  it("sorts people within a department by name", () => {
    const [sales] = groupByDepartment(PEOPLE, DEPARTMENTS);

    expect(sales.people.map((p) => p.full_name)).toEqual(["Bopha Lim", "Sokha Chan"]);
  });

  it("drops departments with nobody in them", () => {
    // HR is configured but empty; a heading over blank space is noise.
    expect(groupByDepartment(PEOPLE, DEPARTMENTS).map((g) => g.name)).not.toContain("HR");
  });

  it("collects people with no department last, rather than losing them", () => {
    const groups = groupByDepartment(PEOPLE, DEPARTMENTS);
    const last = groups[groups.length - 1];

    expect(last.name).toBe("Unassigned");
    expect(last.id).toBeNull();
    expect(last.people.map((p) => p.full_name)).toEqual(["Rithy Nou"]);
  });

  it("also collects people whose department no longer exists", () => {
    // A department the viewer cannot read, or one that was removed.
    const ghost = person({ id: "9", full_name: "Ghost Employee", department_id: "gone" });
    const groups = groupByDepartment([...PEOPLE, ghost], DEPARTMENTS);

    expect(groups[groups.length - 1].people.map((p) => p.full_name)).toEqual([
      "Ghost Employee",
      "Rithy Nou",
    ]);
  });

  it("filters within groups and drops groups the filter empties", () => {
    const groups = groupByDepartment(PEOPLE, DEPARTMENTS, "sales");

    expect(groups.map((g) => g.name)).toEqual(["Sales"]);
    expect(groups[0].people.map((p) => p.full_name)).toEqual(["Bopha Lim", "Sokha Chan"]);
  });

  it("keeps the department heading on a search hit, rather than flattening", () => {
    const groups = groupByDepartment(PEOPLE, DEPARTMENTS, "accountant");

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Accounting");
  });

  it("returns nothing at all when nobody matches", () => {
    expect(groupByDepartment(PEOPLE, DEPARTMENTS, "zzz")).toEqual([]);
  });

  it("returns nothing when there is nobody to group", () => {
    expect(groupByDepartment([], DEPARTMENTS)).toEqual([]);
  });

  it("does not reorder the departments it was handed", () => {
    const given = [HR, SALES, ACCOUNTING];
    groupByDepartment(PEOPLE, given);

    expect(given).toEqual([HR, SALES, ACCOUNTING]);
  });

  it("sorts departments given out of order", () => {
    const groups = groupByDepartment(PEOPLE, [ACCOUNTING, HR, SALES]);

    expect(groups.map((g) => g.name)).toEqual(["Sales", "Accounting", "Unassigned"]);
  });
});

describe("countPeople", () => {
  it("totals across the groups", () => {
    expect(countPeople(groupByDepartment(PEOPLE, DEPARTMENTS))).toBe(4);
  });

  it("counts what a filter left", () => {
    expect(countPeople(groupByDepartment(PEOPLE, DEPARTMENTS, "sales"))).toBe(2);
  });

  it("is zero for no groups", () => {
    expect(countPeople([])).toBe(0);
  });
});

describe("formatDate", () => {
  it("writes a stored date the way a person reads one", () => {
    expect(formatDate("1994-07-12")).toBe("12 July 1994");
  });

  it("does not shift the day across a timezone", () => {
    // Parsed as local midnight rather than UTC, so a date west of Greenwich
    // does not render as the day before.
    expect(formatDate("2026-01-01")).toBe("1 January 2026");
  });

  it("passes null through", () => {
    expect(formatDate(null)).toBeNull();
  });

  it("returns junk unchanged rather than rendering 'Invalid Date'", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("telegramHref", () => {
  it("links a handle with or without its @", () => {
    expect(telegramHref("@sokha")).toBe("https://t.me/sokha");
    expect(telegramHref("sokha")).toBe("https://t.me/sokha");
  });

  it("has nowhere to go for an empty handle", () => {
    expect(telegramHref(null)).toBeUndefined();
    expect(telegramHref("  ")).toBeUndefined();
  });
});

describe("profileGroups", () => {
  const record: UserRecord = {
    id: "u1",
    full_name: "Sokha Chan",
    nickname: "Dara",
    gender: "female",
    date_of_birth: "1994-07-12",
    photo_path: null,
    phone_primary: "012 345 678",
    phone_secondary: null,
    telegram_id: "@sokha",
    email: "sokha@hig.com",
    department_id: "d1",
    position: "Sales Supervisor",
    bank_name: "ABA Bank",
    bank_account_name: "CHAN SOKHA",
    bank_account_number: "000 123 456",
    role_id: "r2",
    status: "active",
    suspended_from: null,
    suspended_to: null,
    discharged_date: null,
    status_note: null,
  };
  const lookups = { department: "Sales", role: "Sales Team" };

  it("groups under the same headings the form edits by", () => {
    const titles = profileGroups(record, lookups).map((g) => g.title);

    expect(titles).toEqual(["Information", "Contact", "Position", "Role"]);
  });

  it("adds bank info only when asked", () => {
    const titles = profileGroups(record, lookups, { includeBank: true }).map(
      (g) => g.title,
    );

    expect(titles).toContain("Bank info");
    expect(titles).toEqual([
      "Information",
      "Contact",
      "Position",
      "Bank info",
      "Role",
    ]);
  });

  it("resolves the lookups rather than showing raw ids", () => {
    const groups = profileGroups(record, lookups);
    const position = groups.find((g) => g.title === "Position")!;

    expect(position.rows).toEqual([
      { label: "Department", value: "Sales" },
      { label: "Position", value: "Sales Supervisor" },
    ]);
  });

  it("keeps an unset field as a row so the page answers 'is this set?'", () => {
    const contact = profileGroups(record, lookups).find((g) => g.title === "Contact")!;
    const secondary = contact.rows.find((r) => r.label === "Secondary phone")!;

    expect(secondary.value).toBeNull();
    expect(secondary.href).toBeUndefined();
  });

  it("makes the contact rows actionable", () => {
    const contact = profileGroups(record, lookups).find((g) => g.title === "Contact")!;

    expect(contact.rows.map((r) => r.href)).toEqual([
      "tel:012 345 678",
      undefined,
      "https://t.me/sokha",
      "mailto:sokha@hig.com",
    ]);
  });

  it("leaves status out, since the header chip and the status card both carry it", () => {
    const role = profileGroups(
      { ...record, status: "suspended" },
      lookups,
    ).find((g) => g.title === "Role")!;

    expect(role.rows.map((r) => r.label)).toEqual(["Role"]);
  });

  it("survives a record with almost nothing filled in", () => {
    const bare: UserRecord = {
      ...record,
      nickname: null,
      gender: null,
      date_of_birth: null,
      phone_primary: null,
      telegram_id: null,
      email: null,
      position: null,
    };
    const groups = profileGroups(bare, { department: null, role: null });

    expect(groups).toHaveLength(4);
    expect(groups.flatMap((g) => g.rows).filter((r) => r.value !== null)).toEqual([
      { label: "Full name", value: "Sokha Chan" },
    ]);
  });
});

describe("statusChange", () => {
  it("carries a range for a suspension and nothing else", () => {
    expect(statusChange("suspended", { from: "2026-03-01", to: "2026-03-31" })).toEqual({
      status: "suspended",
      suspended_from: "2026-03-01",
      suspended_to: "2026-03-31",
      discharged_date: null,
      status_note: null,
    });
  });

  it("carries a single day for a discharge", () => {
    expect(statusChange("discharged", { on: "2026-04-15" })).toEqual({
      status: "discharged",
      suspended_from: null,
      suspended_to: null,
      discharged_date: "2026-04-15",
      status_note: null,
    });
  });

  it("clears every date when someone is reinstated", () => {
    // An active row that still remembers a suspension is a row that gets
    // misread later.
    expect(
      statusChange("active", { from: "2026-03-01", to: "2026-03-31", on: "2026-04-15" }),
    ).toEqual({
      status: "active",
      suspended_from: null,
      suspended_to: null,
      discharged_date: null,
      status_note: null,
    });
  });

  it("ignores dates that belong to the other status", () => {
    const change = statusChange("suspended", { from: "2026-03-01", to: "2026-03-31", on: "2026-04-15" });
    expect(change.discharged_date).toBeNull();
  });

  it("keeps a note, and treats a blank one as absent", () => {
    expect(statusChange("discharged", { on: "2026-04-15", note: " Resigned " }).status_note)
      .toBe("Resigned");
    expect(statusChange("discharged", { on: "2026-04-15", note: "   " }).status_note)
      .toBeNull();
  });
});

describe("statusProblem", () => {
  it("passes a complete suspension and a complete discharge", () => {
    expect(statusProblem(statusChange("suspended", { from: "2026-03-01", to: "2026-03-31" }))).toBeNull();
    expect(statusProblem(statusChange("discharged", { on: "2026-04-15" }))).toBeNull();
  });

  it("asks for both suspension dates", () => {
    // The CHECK would say users_suspension_dates_ck, which tells nobody
    // anything.
    expect(statusProblem(statusChange("suspended", { from: "2026-03-01" })))
      .toBe("A suspension needs both a start and an end date.");
    expect(statusProblem(statusChange("suspended", { to: "2026-03-31" })))
      .toBe("A suspension needs both a start and an end date.");
  });

  it("refuses a suspension that ends before it starts", () => {
    expect(statusProblem(statusChange("suspended", { from: "2026-03-31", to: "2026-03-01" })))
      .toBe("The suspension cannot end before it starts.");
  });

  it("allows a suspension of a single day", () => {
    expect(statusProblem(statusChange("suspended", { from: "2026-03-01", to: "2026-03-01" })))
      .toBeNull();
  });

  it("asks for a discharge date", () => {
    expect(statusProblem(statusChange("discharged", {})))
      .toBe("A discharge needs a date.");
  });

  it("asks nothing of a reinstatement", () => {
    expect(statusProblem(statusChange("active", {}))).toBeNull();
  });
});
