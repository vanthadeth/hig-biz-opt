import { describe, expect, it } from "vitest";
import {
  countPeople,
  displayName,
  groupByDepartment,
  initials,
  matches,
  type Department,
  type DirectoryEntry,
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
