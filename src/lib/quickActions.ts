import type { NavItem, Permission } from "@/lib/access";

/**
 * What the centre button offers, as tiles.
 *
 * Four things come first, in this order, because they are what a rep opens the
 * app to do:
 *
 *   1. Catalogue — the phone goes into the customer's hands. Most frequent, and
 *      the one where fumbling is most visible to somebody else.
 *   2. New visit  — one tap, and the clock starts.
 *   3. New customer — the shop that turned out not to be on the books.
 *   4. Nearest customer — "who am I standing outside", answered by the phone
 *      rather than by scrolling.
 *
 * Everything else this person may create follows underneath. The order is
 * fixed rather than sorted by the module registry: a menu whose buttons move
 * when an administrator adds a module is a menu nobody learns.
 */

export type QuickTile = {
  key: string;
  /** Full wording: "New customer". */
  label: string;
  /** What it does, when that is not obvious from two words. */
  hint?: string;
  icon: string;
  /** Null for the catalogue, which locks the app rather than navigating. */
  href: string | null;
  /** Whether it belongs to the four that lead. */
  lead: boolean;
};

const CREATE_LABELS: Record<string, string> = {
  user: "New employee",
  customer: "New customer",
  product: "New product",
  sale_order: "New sales order",
  invoice: "New invoice",
  payment: "Record payment",
  role_permission: "New role",
  visit: "New visit",
};

/** Modules whose create action is already one of the four that lead. */
const LEADING = new Set(["visit", "customer"]);

export function quickTiles(
  nav: NavItem[],
  permissions: Permission[],
  viewKey: string,
): QuickTile[] {
  const can = (module: string, action: Permission["action"]) =>
    permissions.some((p) => p.module_key === module && p.action === action);

  const inNav = new Set(nav.map((item) => item.module_key));
  const tiles: QuickTile[] = [];

  // 1. The catalogue. Its own permission is `product.view`, not add: browsing
  //    is what it is for, and a rep who may not edit the catalogue may still
  //    show it to somebody.
  if (can("product", "view")) {
    tiles.push({
      key: "catalog",
      label: "Catalog",
      hint: "Hand the phone over",
      icon: "box",
      href: null,
      lead: true,
    });
  }

  if (inNav.has("visit") && can("visit", "add")) {
    tiles.push({
      key: "visit",
      label: "New visit",
      hint: "Starts where you are",
      icon: "pin",
      href: `/${viewKey}/visits`,
      lead: true,
    });
  }

  if (inNav.has("customer") && can("customer", "add")) {
    tiles.push({
      key: "customer",
      label: "New customer",
      hint: "A shop not on the books",
      icon: "building",
      href: `/${viewKey}/customers/new`,
      lead: true,
    });
  }

  // 4. Not a create action at all — the question "which shop am I outside",
  //    which the phone can answer and a list of two hundred names cannot.
  if (inNav.has("customer") && can("customer", "view")) {
    tiles.push({
      key: "nearest",
      label: "Customer info",
      hint: "The nearest shop",
      icon: "search",
      href: `/${viewKey}/customers/nearest`,
      lead: true,
    });
  }

  // Everything else this person may create, in registry order.
  for (const item of nav) {
    if (LEADING.has(item.module_key)) continue;
    if (!can(item.module_key, "add")) continue;
    tiles.push({
      key: item.module_key,
      label: CREATE_LABELS[item.module_key] ?? `New ${item.name.toLowerCase()}`,
      icon: item.icon,
      href: `/${viewKey}/${item.href}`,
      lead: false,
    });
  }

  return tiles;
}

/** The four that lead, and the rest, kept apart for a grid that reads. */
export function splitTiles(tiles: QuickTile[]): { lead: QuickTile[]; rest: QuickTile[] } {
  return {
    lead: tiles.filter((tile) => tile.lead),
    rest: tiles.filter((tile) => !tile.lead),
  };
}
