import type { NavItem, Permission } from "@/lib/access";

export type QuickAction = {
  moduleKey: string;
  /** Full wording, for the sheet: "New sales order". */
  label: string;
  /** The module's own name, for tiles too narrow for the full label. */
  short: string;
  icon: string;
  href: string;
};

/**
 * What each module calls the thing you create in it. Falls back to the module's
 * own name, so a module added later still gets a sensible action without
 * touching this file.
 */
const CREATE_LABELS: Record<string, string> = {
  user: "New employee",
  customer: "New customer",
  product: "New product",
  sale_order: "New sales order",
  invoice: "New invoice",
  payment: "Record payment",
  role_permission: "New role",
};

/**
 * The create actions this person may actually perform in the view they are in.
 *
 * Driven by the same permissions the database enforces, so the sheet can never
 * offer something the row-level policies would then refuse.
 */
export function quickActionsFor(
  nav: NavItem[],
  permissions: Permission[],
  viewKey: string,
): QuickAction[] {
  const canAdd = new Set(
    permissions.filter((p) => p.action === "add").map((p) => p.module_key),
  );

  return nav
    .filter((item) => canAdd.has(item.module_key))
    .map((item) => ({
      moduleKey: item.module_key,
      label: CREATE_LABELS[item.module_key] ?? `New ${item.name.toLowerCase()}`,
      short: item.name,
      icon: item.icon,
      href: `/${viewKey}/${item.href}`,
    }));
}
