import { describe, expect, it } from "vitest";
import { groupNav, type NavItem } from "./nav";

describe("groupNav", () => {
  const item = (key: string, group: string, order: number): NavItem => ({
    module_key: key,
    name: key,
    icon: "square",
    href: key,
    sort_order: order,
    group_name: group,
  });

  it("collects each heading's modules under it", () => {
    const groups = groupNav([
      item("user", "People", 1),
      item("customer", "Selling", 2),
      item("sale_order", "Selling", 3),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["People", "Selling"]);
    expect(groups[1].items.map((i) => i.module_key)).toEqual(["customer", "sale_order"]);
  });

  it("puts a group where its first module sits", () => {
    // Group order is not stored: it falls out of the module order the registry
    // already curates, so there is no second ordering to keep consistent.
    const groups = groupNav([
      item("invoice", "Money", 1),
      item("user", "People", 2),
      item("payment", "Money", 3),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Money", "People"]);
    expect(groups[0].items.map((i) => i.module_key)).toEqual(["invoice", "payment"]);
  });

  it("keeps a group together even when its modules are not adjacent", () => {
    // Otherwise "Money" would appear twice, which reads as two headings that
    // happen to share a name rather than as one group.
    const groups = groupNav([
      item("invoice", "Money", 1),
      item("user", "People", 2),
      item("payment", "Money", 3),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("does not reorder within a group", () => {
    const groups = groupNav([item("b", "Stock", 5), item("a", "Stock", 9)]);
    expect(groups[0].items.map((i) => i.module_key)).toEqual(["b", "a"]);
  });

  it("has nothing to group for a view with no modules", () => {
    expect(groupNav([])).toEqual([]);
  });
});
