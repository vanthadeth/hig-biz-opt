import { describe, expect, it } from "vitest";
import {
  defaultPrinter,
  isEprintAddress,
  sortPrinters,
  validatePrinter,
  type Printer,
} from "./printers";

const printer = (over: Partial<Printer> & { id: string; label: string }): Printer => ({
  eprint_address: `${over.id}@print.example.com`,
  location: null,
  is_default: false,
  sort_order: 0,
  ...over,
});

const PRINTERS = [
  printer({ id: "p1", label: "Front counter", sort_order: 1 }),
  printer({ id: "p2", label: "Warehouse", sort_order: 2, is_default: true }),
  printer({ id: "p3", label: "Accounts", sort_order: 3 }),
];

describe("isEprintAddress", () => {
  it("accepts an ordinary address", () => {
    expect(isEprintAddress("hig-counter@print.epsonconnect.com")).toBe(true);
    expect(isEprintAddress("  spaced@print.example.com  ")).toBe(true);
  });

  it("rejects the half-pasted cases it exists to catch", () => {
    expect(isEprintAddress("hig-counter")).toBe(false);
    expect(isEprintAddress("@print.example.com")).toBe(false);
    expect(isEprintAddress("hig@")).toBe(false);
    expect(isEprintAddress("hig@localhost")).toBe(false);
    expect(isEprintAddress("")).toBe(false);
  });

  it("rejects an address with a space in it", () => {
    expect(isEprintAddress("hig counter@print.example.com")).toBe(false);
  });
});

describe("validatePrinter", () => {
  const good = {
    label: "Front counter",
    eprint_address: "new@print.example.com",
    location: "",
  };

  it("passes a complete draft", () => {
    expect(validatePrinter(good, PRINTERS)).toEqual({});
  });

  it("requires a label", () => {
    expect(validatePrinter({ ...good, label: "  " }, PRINTERS)).toEqual({
      label: "A label is required.",
    });
  });

  it("requires an address, and says so differently from a malformed one", () => {
    expect(validatePrinter({ ...good, eprint_address: "" }, PRINTERS)).toEqual({
      eprint_address: "An e-print address is required.",
    });
    expect(validatePrinter({ ...good, eprint_address: "nope" }, PRINTERS)).toEqual({
      eprint_address: "That does not look like an email address.",
    });
  });

  it("catches an address another printer already uses", () => {
    // The unique index would too, but as an error after the fact.
    const clash = { ...good, eprint_address: "P1@print.example.com" };

    expect(validatePrinter(clash, PRINTERS)).toEqual({
      eprint_address: "Another printer already uses that address.",
    });
  });

  it("lets a printer keep its own address while being edited", () => {
    const same = { ...good, eprint_address: "p1@print.example.com" };

    expect(validatePrinter(same, PRINTERS, "p1")).toEqual({});
  });

  it("reports both problems at once", () => {
    expect(validatePrinter({ label: "", eprint_address: "x", location: "" }, PRINTERS))
      .toEqual({
        label: "A label is required.",
        eprint_address: "That does not look like an email address.",
      });
  });
});

describe("sortPrinters", () => {
  it("puts the default first", () => {
    expect(sortPrinters(PRINTERS).map((p) => p.id)).toEqual(["p2", "p1", "p3"]);
  });

  it("falls back to configured order, then label", () => {
    const tied = [
      printer({ id: "b", label: "Beta" }),
      printer({ id: "a", label: "Alpha" }),
    ];

    expect(sortPrinters(tied).map((p) => p.label)).toEqual(["Alpha", "Beta"]);
  });

  it("does not disturb the array it was given", () => {
    const given = [...PRINTERS];
    sortPrinters(given);

    expect(given.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });
});

describe("defaultPrinter", () => {
  it("finds the one marked default", () => {
    expect(defaultPrinter(PRINTERS)?.id).toBe("p2");
  });

  it("is null when none is marked", () => {
    // Possible: the default was removed and nothing promoted in its place.
    expect(defaultPrinter(PRINTERS.map((p) => ({ ...p, is_default: false })))).toBeNull();
  });

  it("is null when there are no printers at all", () => {
    expect(defaultPrinter([])).toBeNull();
  });
});
