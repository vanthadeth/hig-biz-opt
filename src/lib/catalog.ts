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

/** One row of public.item_catalogue, as the catalogue screen reads it. */
export type CatalogItem = {
  id: string;
  code: string | null;
  name: string;
  name_alt: string | null;
  active: boolean;
  price_usd: number | null;
  price_khr: number | null;
  category_id: string | null;
  category_name: string | null;
  category_name_alt: string | null;
  category_parent_id: string | null;
  category_parent_name: string | null;
  category_parent_name_alt: string | null;
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
  "id, code, name, name_alt, active, price_usd, price_khr, category_id, category_name, category_name_alt, category_parent_id, category_parent_name, category_parent_name_alt, brand_id, brand_name, photo_path, description, stock_qty, low_stock_qty, qty_per_box, qty_per_carton";

export const CART_COLUMNS =
  "id, item_id, quantity, free_quantity, discount_mode, discount_percent, discount_amount";

/** Off a percent of the line, or off it in dollars. Never both. */
export type DiscountMode = "percent" | "amount";

/**
 * A discount as it was agreed, rather than as it works out.
 *
 * Both halves are kept because they are different facts: "ten percent" and
 * "two dollars off" are the same money on one line and different money on the
 * next, and a rep asked afterwards will say which one they gave.
 */
export type Discount = {
  mode: DiscountMode;
  percent: number;
  amount: number;
};

export const NO_DISCOUNT: Discount = { mode: "percent", percent: 0, amount: 0 };

export type CartLine = {
  id: string;
  item_id: string;
  quantity: number;
  /**
   * Given, not sold. Not charged and not discounted, but off the shelf all the
   * same — "buy ten, two free" is twelve leaving the warehouse.
   */
  free_quantity: number;
  /** Per line, because a rep discounts the slow item rather than the basket. */
  discount_mode: DiscountMode;
  discount_percent: number;
  discount_amount: number;
};

/** The discount on a line, as the maths wants it. */
export function lineDiscount(line: {
  discount_mode: DiscountMode;
  discount_percent: number;
  discount_amount: number;
}): Discount {
  return {
    mode: line.discount_mode,
    percent: line.discount_percent,
    amount: line.discount_amount,
  };
}

/** The cart's head. Null customer while somebody is still building it. */
export type Cart = { id: string; customer_id: string | null };

export const CART_HEADER_COLUMNS = "id, customer_id";

/** A customer, as the cart's picker needs to see one. */
export type CartCustomer = {
  id: string;
  shop_name: string;
  street_address: string | null;
  province_text: string | null;
  district_text: string | null;
  latitude: number | null;
  longitude: number | null;
};

export const CART_CUSTOMER_COLUMNS =
  "id, shop_name, street_address, province_text, district_text, latitude, longitude";

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

/*
 * Prices are written by `priceIn` and `totalIn` in `money.ts`, which take the
 * currency the organisation quotes in. There is deliberately nothing here that
 * writes both at once: a screen showing two figures for one price makes the
 * customer choose which they are being asked for.
 */

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
  return a.name.localeCompare(b.name);
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
      item.category_parent_name ?? item.category_name ?? "No category";

    // Only a sub-category earns a sub-heading. Filed on the parent, there is
    // nothing narrower to say.
    const sectionKey = item.category_parent_id ? (item.category_id ?? "") : "";
    const sectionName = item.category_parent_id ? item.category_name : null;

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

/**
 * How many *things* are in the cart, which is what the badge counts.
 *
 * Not the pieces. A cart holding twelve of one item is one item on the badge:
 * the number a rep glances at is "how long is this order", and twelve reads as
 * a list of twelve to somebody who has not opened it yet.
 */
export function cartItemCount(lines: CartLine[]): number {
  return lines.length;
}

/** How many pieces, which is a different question and asked in the cart. */
export function cartPieceCount(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

/** "3 items · 17 pieces", or just the items when they are the same number. */
export function cartCountLine(lines: CartLine[]): string {
  const items = cartItemCount(lines);
  const pieces = cartPieceCount(lines);
  const itemPart = `${items} ${items === 1 ? "item" : "items"}`;
  if (pieces === items) return itemPart;
  return `${itemPart} · ${pieces} ${pieces === 1 ? "piece" : "pieces"}`;
}

// Discounts ------------------------------------------------------------------------

/** A percent off, clamped to something a price can survive. */
export function cleanDiscount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

/** An amount off, in dollars. Not capped here — the share below caps it. */
export function cleanAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}

/** A count of things: whole, not negative, and not a typo. */
export function cleanQuantity(value: number, max?: number): number {
  if (!Number.isFinite(value)) return 0;
  const whole = Math.max(0, Math.floor(value));
  return max === undefined ? whole : Math.min(max, whole);
}

/**
 * What a discount comes to, as a share of the line.
 *
 * The one place this division happens on the client, matching
 * `app.discount_share` exactly — the cart screen and the order it becomes have
 * to agree about it, and two implementations of a division eventually do not.
 *
 * An amount is said in dollars, because that is the currency a discount gets
 * said in, and it becomes a share so the riel side of the same line comes down
 * by the same fraction. That is not converting between currencies: this app has
 * no rate and will not invent one.
 */
export function discountShare(
  discount: Discount,
  unitPriceUsd: number | null,
  quantity: number,
): number {
  if (discount.mode === "percent") return cleanDiscount(discount.percent);

  const line = (unitPriceUsd ?? 0) * quantity;
  // Nothing to take it off — no dollar price, or nothing being bought. No
  // discount at all, rather than all of it.
  if (line <= 0) return 0;

  // An amount larger than the line is the whole line, not a refund.
  return Math.min(100, (cleanAmount(discount.amount) / line) * 100);
}

/** Both currencies for one line, after its discount. */
export function lineTotals(
  item: { price_usd: number | null; price_khr: number | null },
  quantity: number,
  discount: Discount,
): { usd: number | null; khr: number | null } {
  const share = discountShare(discount, item.price_usd, quantity);
  return {
    usd: lineTotal(item.price_usd, quantity, share, 2),
    khr: lineTotal(item.price_khr, quantity, share, 0),
  };
}

/** The same line with nothing off, for showing what the discount saved. */
export function lineBefore(
  item: { price_usd: number | null; price_khr: number | null },
  quantity: number,
): { usd: number | null; khr: number | null } {
  return {
    usd: lineTotal(item.price_usd, quantity, 0, 2),
    khr: lineTotal(item.price_khr, quantity, 0, 0),
  };
}

/**
 * What a line comes to, in one currency, after its discount.
 *
 * Rounded at the line rather than at the total: the line is what somebody
 * reads back to the shopkeeper, and a total that does not equal the lines
 * added up is a total nobody trusts.
 */
export function lineTotal(
  unitPrice: number | null,
  quantity: number,
  discountPercent: number,
  decimals: number,
): number | null {
  if (unitPrice === null) return null;
  const gross = unitPrice * quantity * (1 - cleanDiscount(discountPercent) / 100);
  const factor = 10 ** decimals;
  return Math.round(gross * factor) / factor;
}

/** "10% off" — said only when there is something to say. */
export function discountLabel(discountPercent: number): string | null {
  const clean = cleanDiscount(discountPercent);
  if (clean === 0) return null;
  // Trailing zeros dropped: "12.5% off", not "12.50% off".
  return `${Number(clean.toFixed(2))}% off`;
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
    const { usd: inUsd, khr: inKhr } = lineTotals(item, line.quantity, lineDiscount(line));
    if (inUsd !== null) usd = (usd ?? 0) + inUsd;
    if (inKhr !== null) khr = (khr ?? 0) + inKhr;
  }

  return { usd, khr };
}

/**
 * What the discounts took off, in each currency.
 *
 * Null in a currency means nothing was discounted in it — which is different
 * from zero, and reads differently: "0.00 off" on a cart nobody discounted is
 * a line of noise.
 */
export function cartSavings(entries: CartEntry[]): {
  usd: number | null;
  khr: number | null;
} {
  let usd: number | null = null;
  let khr: number | null = null;

  for (const { line, item } of entries) {
    const discount = lineDiscount(line);
    if (discountShare(discount, item.price_usd, line.quantity) === 0) continue;

    const before = lineBefore(item, line.quantity);
    const after = lineTotals(item, line.quantity, discount);
    if (before.usd !== null && after.usd !== null) usd = (usd ?? 0) + before.usd - after.usd;
    if (before.khr !== null && after.khr !== null) khr = (khr ?? 0) + before.khr - after.khr;
  }

  return { usd, khr };
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

/**
 * How many pieces a line takes off the shelf.
 *
 * The free ones are given rather than sold, but they leave the warehouse with
 * the rest — a picker packing twelve against an order that says ten is a
 * dispute waiting to happen.
 */
export function lineOffShelf(line: { quantity: number; free_quantity: number }): number {
  return line.quantity + line.free_quantity;
}

// Packing ---------------------------------------------------------------------------

/** A way this item is sold: a name, how many that is, and whether to lead with it. */
export type PackChoice = { key: string; label: string; quantity: number; lead: boolean };

/**
 * The quantities worth one tap.
 *
 * A rep selling hardware orders a box, not eleven of something. The box is the
 * one to lead with where there is one — that is how these go out of the door —
 * and the single is kept because the last one of an order often is one.
 *
 * Skips anything that would repeat a number already offered: "Box 1" next to
 * "Single 1" is two buttons that do the same thing.
 */
export function packChoices(item: {
  qty_per_box: number | null;
  qty_per_carton: number | null;
}): PackChoice[] {
  const hasBox = (item.qty_per_box ?? 0) > 1;
  const raw: PackChoice[] = [
    { key: "single", label: "Single", quantity: 1, lead: !hasBox },
    ...(hasBox
      ? [{ key: "box", label: "Box", quantity: item.qty_per_box as number, lead: true }]
      : []),
    ...((item.qty_per_carton ?? 0) > 1
      ? [
          {
            key: "carton",
            label: "Carton",
            quantity: item.qty_per_carton as number,
            lead: false,
          },
        ]
      : []),
  ];

  const seen = new Set<number>();
  return raw.filter((choice) => {
    if (seen.has(choice.quantity)) return false;
    seen.add(choice.quantity);
    return true;
  });
}

/** "10 + 2 free", or just the number when nothing is being given away. */
export function quantityLine(quantity: number, free: number): string {
  return free > 0 ? `${quantity} + ${free} free` : String(quantity);
}

/** Does this item answer the search — by name, code or brand? */
export function matchesCatalog(item: CatalogItem, query: string): boolean {
  const needle = query.toLowerCase().trim();
  if (needle === "") return true;
  return [item.name, item.name_alt, item.code, item.brand_name].some(
    (field) => field != null && field.toLowerCase().includes(needle),
  );
}

// Who the cart is for --------------------------------------------------------------

/**
 * The customers to offer, nearest first when the phone knows where it is.
 *
 * A rep opens the cart standing in the shop they are selling to, so the shop
 * they want is almost always the one they are inside. Without a fix — no
 * permission, no signal, a customer whose coordinates were never recorded —
 * this falls back to alphabetical, which is at least predictable.
 *
 * Straight-line distance on a sphere. Cambodia is not large enough for the
 * ellipsoid to matter, and this is choosing between shops in a district, not
 * navigating between them.
 */
export function nearestCustomers(
  customers: CartCustomer[],
  from: { latitude: number; longitude: number } | null,
): CartCustomer[] {
  const byName = [...customers].sort((a, b) => a.shop_name.localeCompare(b.shop_name));
  if (!from) return byName;

  return byName
    .map((customer) => ({ customer, metres: distanceMetres(from, customer) }))
    .sort((a, b) => {
      // A shop with no coordinates is not far away, it is unknown. Unknown
      // sorts after everything known rather than to the top or the bottom of
      // a distance it does not have.
      if (a.metres === null && b.metres === null) return 0;
      if (a.metres === null) return 1;
      if (b.metres === null) return -1;
      return a.metres - b.metres;
    })
    .map((entry) => entry.customer);
}

/** Metres between a point and a customer, or null if the customer has no fix. */
export function distanceMetres(
  from: { latitude: number; longitude: number },
  to: { latitude: number | null; longitude: number | null },
): number | null {
  if (to.latitude === null || to.longitude === null) return null;

  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** "120 m" or "4.3 km" — near enough for choosing between shops. */
export function distanceLabel(metres: number | null): string | null {
  if (metres === null) return null;
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/** The shop's address in one line, for telling two branches apart. */
export function customerWhere(customer: CartCustomer): string | null {
  const parts = [customer.street_address, customer.district_text, customer.province_text]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);
  return parts.length ? parts.join(", ") : null;
}

/**
 * The line above a cart item's name: what is being bought, at what, less what.
 *
 * "10 + 2 free × $10.00 −10%". One line rather than three labelled fields,
 * because a rep reads it back to a shopkeeper as a sentence and every word of
 * it is a number they already said out loud.
 *
 * Each part disappears when it has nothing to say: no free ones, no discount,
 * no price. What is left still reads.
 */
export function cartLineDetail(
  item: { price_usd: number | null; price_khr: number | null },
  line: {
    quantity: number;
    free_quantity: number;
    discount_mode: DiscountMode;
    discount_percent: number;
    discount_amount: number;
  },
  price: string | null,
): string {
  const parts = [quantityLine(line.quantity, line.free_quantity)];
  if (price) parts.push(`× ${price}`);

  const off = discountOff(line);
  if (off) parts.push(off);

  return parts.join(" ");
}

/**
 * The discount on a line, as short as it can be said.
 *
 * Money stays money and a percent stays a percent: rewriting "two dollars off"
 * as a percentage tells somebody they said something they did not.
 */
export function discountOff(line: {
  discount_mode: DiscountMode;
  discount_percent: number;
  discount_amount: number;
}): string | null {
  if (line.discount_mode === "amount") {
    const amount = cleanAmount(line.discount_amount);
    return amount > 0 ? `−$${amount.toFixed(2)}` : null;
  }
  const percent = cleanDiscount(line.discount_percent);
  // Trailing zeros dropped: "−12.5%", not "−12.50%".
  return percent > 0 ? `−${Number(percent)}%` : null;
}
