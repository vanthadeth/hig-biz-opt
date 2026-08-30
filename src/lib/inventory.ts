/**
 * The catalogue, as the screens see it.
 *
 * Two things here are worth stating once rather than rediscovering in every
 * component:
 *
 *   * Price lives on the variant, never on the item. An item with nothing to
 *     vary still has exactly one variant, with no attribute on it. So a list
 *     showing "the price" is really showing a range that happens to have one
 *     end, which is why `priceRange` takes a min and a max even when they are
 *     the same number.
 *
 *   * Both currencies are stored, not converted. Riel is whole — the smallest
 *     note in circulation is 100៛ — so it is formatted without decimals, while
 *     dollars keep their cents.
 */

export type Category = {
  id: string;
  parent_id: string | null;
  name_en: string;
  name_km: string | null;
  description: string | null;
  photo_path: string | null;
  active: boolean;
  sort_order: number;
};

export type Brand = {
  id: string;
  name: string;
  description: string | null;
  logo_path: string | null;
  active: boolean;
  sort_order: number;
};

export type Item = {
  id: string;
  code: string | null;
  name_en: string;
  name_km: string | null;
  description: string | null;
  category_id: string | null;
  brand_id: string | null;
  active: boolean;
};

export type Variant = {
  id: string;
  item_id: string;
  attribute_name: string | null;
  attribute_value: string | null;
  price_usd: number | null;
  price_khr: number | null;
  photo_path: string | null;
  active: boolean;
  sort_order: number;
};

/** One row of public.item_catalogue: an item with its names and price range. */
export type CatalogueEntry = {
  id: string;
  code: string | null;
  name_en: string;
  name_km: string | null;
  active: boolean;
  category_id: string | null;
  category_name_en: string | null;
  category_name_km: string | null;
  category_parent_id: string | null;
  category_parent_name_en: string | null;
  category_parent_name_km: string | null;
  brand_id: string | null;
  brand_name: string | null;
  variant_count: number | null;
  min_price_usd: number | null;
  max_price_usd: number | null;
  min_price_khr: number | null;
  max_price_khr: number | null;
  photo_path: string | null;
};

export const ITEM_COLUMNS =
  "id, code, name_en, name_km, description, category_id, brand_id, active";

export const VARIANT_COLUMNS =
  "id, item_id, attribute_name, attribute_value, price_usd, price_khr, photo_path, active, sort_order";

export const CATEGORY_COLUMNS =
  "id, parent_id, name_en, name_km, description, photo_path, active, sort_order";

export const BRAND_COLUMNS =
  "id, name, description, logo_path, active, sort_order";

// One literal, not a concatenation: supabase-js parses this string in the type
// system to work out the row shape, and a joined expression widens to `string`,
// which it can only read back as an error type.
export const CATALOGUE_COLUMNS =
  "id, code, name_en, name_km, active, category_id, category_name_en, category_name_km, category_parent_id, category_parent_name_en, category_parent_name_km, brand_id, brand_name, variant_count, min_price_usd, max_price_usd, min_price_khr, max_price_khr, photo_path";

/** Where item pictures go in the inventory bucket. */
export const INVENTORY_BUCKET = "inventory";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const khr = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatUsd(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return usd.format(value);
}

/** Riel, with the symbol in front and no decimals. */
export function formatKhr(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return `៛${khr.format(value)}`;
}

/**
 * A price, or the span between the cheapest and dearest variant.
 *
 * One number when the ends agree, which is the ordinary case: most items have
 * one price, and printing "$1.50 – $1.50" would look like a bug.
 */
export function priceRange(
  min: number | null | undefined,
  max: number | null | undefined,
  format: (v: number | null | undefined) => string | null,
): string | null {
  const low = format(min);
  const high = format(max);
  if (low === null) return high;
  if (high === null || low === high) return low;
  return `${low} – ${high}`;
}

/** Both currencies on one line, or whichever of them is priced. */
export function bothPrices(entry: {
  min_price_usd: number | null;
  max_price_usd: number | null;
  min_price_khr: number | null;
  max_price_khr: number | null;
}): string {
  const dollars = priceRange(entry.min_price_usd, entry.max_price_usd, formatUsd);
  const riel = priceRange(entry.min_price_khr, entry.max_price_khr, formatKhr);
  return [dollars, riel].filter(Boolean).join(" · ") || "No price yet";
}

/**
 * What to call a variant on screen.
 *
 * The unattributed row is the item itself rather than a variation of it, so it
 * gets a name that says so instead of an empty cell.
 */
export function variantLabel(variant: {
  attribute_name: string | null;
  attribute_value: string | null;
}): string {
  if (!variant.attribute_name || !variant.attribute_value) return "Standard";
  return `${variant.attribute_name}: ${variant.attribute_value}`;
}

/**
 * Both names, when there are two.
 *
 * The one rendering of a bilingual name in the app, so an item and its category
 * read the same way rather than each screen inventing a separator.
 */
export function bilingual(
  en: string | null | undefined,
  km: string | null | undefined,
): string {
  if (!en) return km ?? "";
  return km ? `${en} — ${km}` : en;
}

export function itemTitle(item: { name_en: string; name_km: string | null }): string {
  return bilingual(item.name_en, item.name_km);
}

export function categoryLabel(category: {
  name_en: string;
  name_km: string | null;
}): string {
  return bilingual(category.name_en, category.name_km);
}

/**
 * "Grocery / Drinks", or just the one it has, or null.
 *
 * English only, and deliberately: this is the compact breadcrumb on a chip,
 * where it locates an item rather than naming it. Both names at both levels
 * would be four words on a chip that has room for two. The Khmer name is shown
 * where the category is the subject — the manager list, the picker, the group
 * heading — rather than here.
 */
export function categoryPath(entry: {
  category_name_en: string | null;
  category_parent_name_en: string | null;
}): string | null {
  if (!entry.category_name_en) return null;
  return entry.category_parent_name_en
    ? `${entry.category_parent_name_en} / ${entry.category_name_en}`
    : entry.category_name_en;
}

const fold = (value: string) => value.toLowerCase().trim();

/**
 * Does this item answer the search?
 *
 * Khmer is matched as typed: it has no case to fold and no accents to strip, so
 * lowercasing it is a no-op rather than a mistake, and the same comparison
 * serves both languages.
 */
export function matchesItem(entry: CatalogueEntry, query: string): boolean {
  const needle = fold(query);
  if (needle === "") return true;

  return [
    entry.name_en,
    entry.name_km,
    entry.code,
    entry.brand_name,
    entry.category_name_en,
    entry.category_name_km,
    entry.category_parent_name_en,
    entry.category_parent_name_km,
  ].some((field) => field !== null && field !== undefined && fold(field).includes(needle));
}

/**
 * The two names are kept apart rather than joined here, because the heading
 * renders them differently: the English half is uppercased and letter-spaced,
 * and neither of those should be done to Khmer script.
 */
export type CatalogueGroup = {
  key: string;
  nameEn: string;
  nameKm: string | null;
  items: CatalogueEntry[];
};

/**
 * The catalogue under its category headings, top-level first.
 *
 * Sub-categories are folded into their parent's group: two levels of heading on
 * a phone leaves no room for the items underneath, and the item row names its
 * own sub-category anyway.
 */
export function groupByCategory(
  entries: CatalogueEntry[],
  query = "",
): CatalogueGroup[] {
  const matched = entries.filter((entry) => matchesItem(entry, query));
  const groups = new Map<string, CatalogueGroup>();

  for (const entry of matched) {
    // A sub-category's items belong under its parent's heading.
    const key = entry.category_parent_id ?? entry.category_id ?? "";
    const nameEn =
      entry.category_parent_name_en ?? entry.category_name_en ?? "No category";
    // Whichever level supplied the English name supplies the Khmer one, so the
    // heading never reads as a parent in one language and a child in the other.
    const nameKm = entry.category_parent_name_en
      ? entry.category_parent_name_km
      : entry.category_name_en
        ? entry.category_name_km
        : null;

    const group = groups.get(key);
    if (group) group.items.push(entry);
    else groups.set(key, { key: key || "uncategorised", nameEn, nameKm, items: [entry] });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => a.name_en.localeCompare(b.name_en)),
    }))
    .sort((a, b) => {
      // Whatever has no category goes last, however it sorts by name.
      if (a.key === "uncategorised") return 1;
      if (b.key === "uncategorised") return -1;
      return a.nameEn.localeCompare(b.nameEn);
    });
}

export function countItems(groups: CatalogueGroup[]): number {
  return groups.reduce((total, group) => total + group.items.length, 0);
}

/** Sort order first, then the English name — the one every category has. */
const byOrder = (a: Category, b: Category) =>
  a.sort_order - b.sort_order || a.name_en.localeCompare(b.name_en);

/**
 * Categories as a select list, sub-categories indented under their parent.
 *
 * One flat list rather than two chained selects: with a single level of nesting
 * the whole tree fits in one control, and chaining them would make choosing a
 * top-level category a two-step operation for no gain.
 */
export function categoryOptions(
  categories: Category[],
): { value: string; label: string }[] {
  const parents = categories.filter((c) => c.parent_id === null).sort(byOrder);

  const options: { value: string; label: string }[] = [];

  // Both names on the option, because this is the control where somebody is
  // looking for a category rather than reading one they already know.
  for (const parent of parents) {
    options.push({ value: parent.id, label: categoryLabel(parent) });
    const children = categories.filter((c) => c.parent_id === parent.id).sort(byOrder);
    for (const child of children) {
      options.push({
        value: child.id,
        label: `${OPTION_INDENT}${categoryLabel(child)}`,
      });
    }
  }

  // A sub-category whose parent is missing from the list would otherwise
  // vanish, taking every item filed under it out of reach of the form.
  const placed = new Set(options.map((o) => o.value));
  for (const orphan of categories.filter((c) => !placed.has(c.id))) {
    options.push({ value: orphan.id, label: categoryLabel(orphan) });
  }

  return options;
}

/**
 * What a sub-category is indented by in a select.
 *
 * Non-breaking spaces, not ordinary ones: a browser collapses leading
 * whitespace inside an <option>, so plain spaces would indent nothing at all.
 */
export const OPTION_INDENT = "\u00a0\u00a0\u00a0";

export type CategoryTree = { parent: Category; children: Category[] }[];

/** The category list as it is managed: parents, each with its own children. */
export function categoryTree(categories: Category[]): CategoryTree {
  return categories
    .filter((c) => c.parent_id === null)
    .sort(byOrder)
    .map((parent) => ({
      parent,
      children: categories.filter((c) => c.parent_id === parent.id).sort(byOrder),
    }));
}

/**
 * A number typed into a price box, or null for an empty one.
 *
 * Returns `undefined` for something that is not a price at all, so a form can
 * tell "nothing entered" from "that is not a number" and say so.
 */
export function parsePrice(input: string): number | null | undefined {
  const trimmed = input.trim().replace(/[,\s]/g, "");
  if (trimmed === "") return null;
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
