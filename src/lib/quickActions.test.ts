import { describe, expect, it } from "vitest";
import { quickTiles, splitTiles } from "./quickActions";
import type { NavItem, Permission } from "./access";

const nav = (...keys: string[]): NavItem[] =>
  keys.map((key, i) => ({
    module_key: key,
    name: key.replace("_", " "),
    icon: "square",
    href: key.replace("_", "-"),
    sort_order: i,
    group_name: "Selling",
  }));

const perm = (module_key: string, action: Permission["action"]): Permission => ({
  module_key,
  action,
  scope: "own",
});

const ALL = nav("product", "visit", "customer", "sale_order", "payment", "user");
const REP = [
  perm("product", "view"),
  perm("visit", "add"),
  perm("customer", "add"),
  perm("customer", "view"),
  perm("sale_order", "add"),
];

describe("the four that lead", () => {
  /**
   * The order is the point of this file. A rep opens the app to show the
   * catalogue, start a visit, add the shop that turned out not to be on the
   * books, or ask which shop they are outside — in that order of frequency.
   */
  it("come in the order somebody actually reaches for them", () => {
    const { lead } = splitTiles(quickTiles(ALL, REP, "sales"));
    expect(lead.map((t) => t.key)).toEqual(["catalog", "visit", "customer", "nearest"]);
  });

  it("and the rest follow underneath, in registry order", () => {
    const { rest } = splitTiles(quickTiles(ALL, REP, "sales"));
    expect(rest.map((t) => t.key)).toEqual(["sale_order"]);
  });

  it("point at the right places", () => {
    const tiles = quickTiles(ALL, REP, "sales");
    const href = (key: string) => tiles.find((t) => t.key === key)?.href;

    expect(href("visit")).toBe("/sales/visits");
    expect(href("customer")).toBe("/sales/customers/new");
    expect(href("nearest")).toBe("/sales/customers/nearest");
    // The catalogue locks the app rather than navigating, so it has no href
    // at all — anything else would let it be opened without the lock going on.
    expect(href("catalog")).toBeNull();
  });
});

describe("what a person may not do is not offered", () => {
  it("no catalogue without permission to see products", () => {
    const tiles = quickTiles(ALL, [perm("visit", "add")], "sales");
    expect(tiles.map((t) => t.key)).not.toContain("catalog");
  });

  it("no new visit without permission to add one", () => {
    const tiles = quickTiles(ALL, [perm("product", "view")], "sales");
    expect(tiles.map((t) => t.key)).not.toContain("visit");
  });

  /**
   * Reading a customer and creating one are different permissions, and a rep
   * who may look one up but not add one gets exactly one of the two tiles.
   */
  it("nor a new customer to somebody who may only look them up", () => {
    const tiles = quickTiles(ALL, [perm("customer", "view")], "sales");
    expect(tiles.map((t) => t.key)).toEqual(["nearest"]);
  });

  it("and nor the other way round", () => {
    const tiles = quickTiles(ALL, [perm("customer", "add")], "sales");
    expect(tiles.map((t) => t.key)).toEqual(["customer"]);
  });

  it("offers nothing at all to somebody with no permissions", () => {
    expect(quickTiles(ALL, [], "sales")).toEqual([]);
  });
});

describe("modules that are not in this view", () => {
  it("are left out even when the permission exists", () => {
    // Holding visit.add while standing in a view that has no visit module is
    // a menu entry pointing at a page this view does not have.
    const tiles = quickTiles(nav("customer"), REP, "admin");
    expect(tiles.map((t) => t.key)).not.toContain("visit");
  });
});

describe("naming the rest", () => {
  it("uses the wording each module goes by", () => {
    const tiles = quickTiles(ALL, [...REP, perm("payment", "add"), perm("user", "add")], "sales");
    const label = (key: string) => tiles.find((t) => t.key === key)?.label;

    expect(label("payment")).toBe("Record payment");
    expect(label("user")).toBe("New employee");
    expect(label("sale_order")).toBe("New sales order");
  });

  it("and falls back on the module's own name for one added later", () => {
    const tiles = quickTiles(nav("shipment"), [perm("shipment", "add")], "sales");
    expect(tiles[0].label).toBe("New shipment");
  });
});
