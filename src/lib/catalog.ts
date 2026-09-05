/**
 * The catalogue, as somebody selling from it sees it.
 *
 * Distinct from `inventory.ts`, which is the back office's view of the same
 * rows: there an item is a record to correct, here it is something on a shelf
 * with a price and a quantity left. The two screens ask different questions of
 * the same table, and keeping the answers apart is what stops either turning
 * into a settings page for the other.
 */

import type { ChipTone } from "@/components/ui/Chip";
import { formatKhr, formatUsd } from "@/lib/inventory";

/** One row of public.item_catalogue, as the catalogue screen reads it. */
export type CatalogItem = {
  id: string;
  code: string | null;
  name_en: string;
  name_km: string | null;
  active: boolean;
  price_usd: number | null;
  price_khr: number | null;
  category_id: string | null;
  category_name_en: string | null;
  category_name_km: string | null;
  category_parent_id: string | null;
  category_parent_name_en: string | null;
  category_parent_name_km: string | null;
  brand_id: string | null;
  brand_name: string | null;
  photo_path: string | null;
  description: string | null;
  stock_qty: number;
  low_stock_qty: number;
  qty_per_box: number | null;
  qty_per_carton: number | null;
};

// One literal, not a concatenation: supabase-js reads this string in the type
// system to work out the row shape, and a joined expression widens to `string`.
export const CATALOG_COLUMNS =
  "id, code, name_en, name_km, active, price_usd, price_khr, category_id, category_name_en, category_name_km, category_parent_id, category_parent_name_en, category_parent_name_km, brand_id, brand_name, photo_path, description, stock_qty, low_stock_qty, qty_per_box, qty_per_carton";

export const CART_COLUMNS = "id, item_id, quantity";

export type CartLine = { id: string; item_id: string; quantity: number };

// Availability -------------------------------------------------------------------

export type StockState = "none" | "low" | "available";

/**
 * Three states, because that is how many decisions there are: do not sell it,
 * sell it but say something, sell it.
 *
 * A low threshold of zero means nothing is ever low, which is the right answer
 * for an item nobody has set a level on — a warning that fires on every item is
 * a warning nobody reads.
 */
export function stockState(item: {
  stock_qty: number;
  low_stock_qty: number;
}): StockState {
  if (item.stock_qty <= 0) return "none";
  if (item.low_stock_qty > 0 && item.stock_qty <= item.low_stock_qty) return "low";
  return "available";
}

export const STOCK_LABELS: Record<StockState, string> = {
  none: "No stock",
  low: "Low stock",
  available: "Available",
};

export const STOCK_TONE: Record<StockState, ChipTone> = {
  none: "danger",
  low: "warn",
  available: "accent",
};

/** "12 per box · 144 per carton", or whichever half is known. */
export function packingLine(item: {
  qty_per_box: number | null;
  qty_per_carton: number | null;
}): string | null {
  const parts = [
    item.qty_per_box === null ? null : `${item.qty_per_box} per box`,
    item.qty_per_carton === null ? null : `${item.qty_per_carton} per carton`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Both currencies on one line, or whichever of them is priced. */
export function priceLine(item: {
  price_usd: number | null;
  price_khr: number | null;
}): string {
  const both = [formatUsd(item.price_usd), formatKhr(item.price_khr)].filter(Boolean);
  return both.join(" · ") || "No price yet";
}

// Ordering -------------------------------------------------------------------------

/**
 * By item code, ascending, as the catalogue is asked to be.
 *
 * `numeric` so HIG-2 comes before HIG-10 rather than after it, which is what
 * anybody reading a code as a number expects. An item with no code sorts after
 * every coded one and then by name: it has nothing to sort on, and burying it
 * at the top under an empty string would put the least identifiable items
 * first.
 */
export function byCode(a: CatalogItem, b: CatalogItem): number {
  const left = a.code?.trim() ?? "";
  const right = b.code?.trim() ?? "";
  if (left && right) {
    return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
  }
  if (left) return -1;
  if (right) return 1;
  return a.name_en.localeCompare(b.name_en);
}

// Grouping -------------------------------------------------------------------------

/**
 * A sub-category's worth of items. `name` is null for the items filed directly
 * on the parent, which are listed before the sub-headings rather than under an
 * invented one.
 */
export type CatalogSection = { key: string; name: string | null; items: CatalogItem[] };

export type CatalogGroup = { key: string; name: string; sections: CatalogSection[] };

const UNCATEGORISED = "uncategorised";

/**
 * The catalogue under its category and sub-category headings.
 *
 * An item filed on a sub-category appears under that sub-category, inside its
 * parent's group. An item filed on a top-level category appears in that
 * category's group with no sub-heading, ahead of the sub-categories — it
 * belongs to the whole of it, not to one part.
 *
 * Categories sort by name and sub-categories with them; items sort by code.
 * "No category" goes last however it would sort, because it is not a category
 * so much as the absence of one.
 */
export function catalogGroups(items: CatalogItem[]): CatalogGroup[] {
  const groups = new Map<string, { name: string; sections: Map<string, CatalogSection> }>();

  for (const item of items) {
    // A sub-category's items belong in its parent's group; a top-level
    // category's belong in its own.
    const groupKey = item.category_parent_id ?? item.category_id ?? UNCATEGORISED;
    const groupName =
      item.category_parent_name_en ?? item.category_name_en ?? "No category";

    // Only a sub-category earns a sub-heading. Filed on the parent, there is
    // nothing narrower to say.
    const sectionKey = item.category_parent_id ? (item.category_id ?? "") : "";
    const sectionName = item.category_parent_id ? item.category_name_en : null;

    let group = groups.get(groupKey);
    if (!group) {
      group = { name: groupName, sections: new Map() };
      groups.set(groupKey, group);
    }

    let section = group.sections.get(sectionKey);
    if (!section) {
      section = { key: sectionKey || `${groupKey}-direct`, name: sectionName, items: [] };
      group.sections.set(sectionKey, section);
    }
    section.items.push(item);
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      name: group.name,
      sections: [...group.sections.values()]
        .map((section) => ({ ...section, items: [...section.items].sort(byCode) }))
        .sort((a, b) => {
          // The parent's own items lead; sub-categories follow by name.
          if (a.name === null) return -1;
          if (b.name === null) return 1;
          return a.name.localeCompare(b.name);
        }),
    }))
    .sort((a, b) => {
      if (a.key === UNCATEGORISED) return 1;
      if (b.key === UNCATEGORISED) return -1;
      return a.name.localeCompare(b.name);
    });
}

export function countCatalog(groups: CatalogGroup[]): number {
  return groups.reduce(
    (total, group) =>
      total + group.sections.reduce((n, section) => n + section.items.length, 0),
    0,
  );
}

// The cart -------------------------------------------------------------------------

export type CartEntry = { line: CartLine; item: CatalogItem };

/** The lines a person actually has, paired with what they are lines of. */
export function cartEntries(lines: CartLine[], items: CatalogItem[]): CartEntry[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return lines
    .map((line) => ({ line, item: byId.get(line.item_id) }))
    .filter((entry): entry is CartEntry => entry.item !== undefined)
    .sort((a, b) => byCode(a.item, b.item));
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

/**
 * What the cart comes to, in each currency separately.
 *
 * Never converted between them: HIG prices in both and the rate is a decision
 * somebody makes, not one this screen should quietly make for them. An item
 * priced in only one currency contributes to that one alone, which is why the
 * two totals are not two views of the same number.
 */
export function cartTotals(entries: CartEntry[]): {
  usd: number | null;
  khr: number | null;
} {
  let usd: number | null = null;
  let khr: number | null = null;

  for (const { line, item } of entries) {
    if (item.price_usd !== null) usd = (usd ?? 0) + item.price_usd * line.quantity;
    if (item.price_khr !== null) khr = (khr ?? 0) + item.price_khr * line.quantity;
  }

  return { usd, khr };
}

export function totalsLine(totals: { usd: number | null; khr: number | null }): string {
  const both = [formatUsd(totals.usd), formatKhr(totals.khr)].filter(Boolean);
  return both.join(" · ") || "—";
}

/**
 * How many of an item somebody may still add.
 *
 * The stock figure is the cap: a catalogue that lets a rep promise forty of
 * something there are six of has cost the company a delivery. Null means the
 * item is out of stock entirely and there is nothing to add.
 */
export function addableQty(item: CatalogItem, alreadyInCart: number): number {
  return Math.max(0, item.stock_qty - alreadyInCart);
}

/** Does this item answer the search — by name, code or brand? */
export function matchesCatalog(item: CatalogItem, query: string): boolean {
  const needle = query.toLowerCase().trim();
  if (needle === "") return true;
  return [item.name_en, item.name_km, item.code, item.brand_name].some(
    (field) => field != null && field.toLowerCase().includes(needle),
  );
}
