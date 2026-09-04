import { describe, expect, it } from "vitest";
import { quickActionsFor } from "./quickActions";
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

describe("quickActionsFor", () => {
  it("offers only modules the caller may add to", () => {
    const actions = quickActionsFor(
      nav("customer", "sale_order", "payment"),
      [perm("customer", "add"), perm("payment", "add")],
      "sales",
    );
    expect(actions.map((a) => a.moduleKey)).toEqual(["customer", "payment"]);
  });

  it("ignores view, edit and delete", () => {
    // Being able to read customers is not permission to create one.
    const actions = quickActionsFor(
      nav("customer"),
      [perm("customer", "view"), perm("customer", "edit"), perm("customer", "delete")],
      "sales",
    );
    expect(actions).toEqual([]);
  });

  it("never offers a module missing from this view's navigation", () => {
    // The permission exists, but the module is not part of this workspace.
    const actions = quickActionsFor(nav("customer"), [perm("invoice", "add")], "sales");
    expect(actions).toEqual([]);
  });

  it("uses the module's own wording", () => {
    const actions = quickActionsFor(nav("sale_order"), [perm("sale_order", "add")], "sales");
    expect(actions[0].label).toBe("New sales order");
  });

  it("also carries the bare module name for narrow tiles", () => {
    const orders: NavItem[] = [
      {
        module_key: "sale_order",
        name: "Sales Order",
        icon: "cart",
        href: "sale-orders",
        sort_order: 1,
        group_name: "Selling",
      },
    ];
    const actions = quickActionsFor(orders, [perm("sale_order", "add")], "sales");
    expect(actions[0].short).toBe("Sales Order");
    expect(actions[0].label).toBe("New sales order");
  });

  it("falls back to the module name for a module it has never heard of", () => {
    // A module added later still gets a usable action with no code change.
    const actions = quickActionsFor(
      [
        {
          module_key: "delivery",
          name: "Delivery",
          icon: "box",
          href: "deliveries",
          sort_order: 1,
          group_name: "Stock",
        },
      ],
      [perm("delivery", "add")],
      "warehouse",
    );
    expect(actions[0].label).toBe("New delivery");
  });

  it("builds hrefs inside the current view", () => {
    const customers: NavItem[] = [
      {
        module_key: "customer",
        name: "Customer",
        icon: "building",
        href: "customers",
        sort_order: 1,
        group_name: "Selling",
      },
    ];
    const actions = quickActionsFor(customers, [perm("customer", "add")], "accounting");
    expect(actions[0].href).toBe("/accounting/customers");
  });

  it("returns nothing when no permissions are held", () => {
    expect(quickActionsFor(nav("customer"), [], "sales")).toEqual([]);
  });
});
