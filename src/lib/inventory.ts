/**
 * The catalogue, as the screens see it.
 *
 * Two things here are worth stating once rather than rediscovering in every
 * component:
 *
 *   * The item carries the code and the price. One item, one price — so every
 *     screen shows a figure rather than a range, and "the price of an item" has
 *     one answer.
 *
 *   * A variant describes: the size, the colour, the picture. It carries a
 *     barcode too, which is the one identifier that genuinely differs between a
 *     500 ml bottle and a 1.5 L one, because a barcode is assigned to the
 *     physical package rather than to the product.
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
  price_usd: number | null;
  price_khr: number | null;
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
  barcode: string | null;
  property_name: string | null;
  property_value: string | null;
  photo_path: string | null;
  active: boolean;
  sort_order: number;
};

/**
 * A picture of the item itself.
 *
 * Distinct from a variant's photo: this is the item on a white background, the
 * one that stands for it in a list. A variant's picture is the narrower thing —
 * that particular size or colour. An item with no variants at all, which after
 * the price moved up is the ordinary case, still needs somewhere to put one.
 */
export type ItemPicture = {
  id: string;
  item_id: string;
  photo_path: string;
  description: string | null;
  is_primary: boolean;
  sort_order: number;
};

export const ITEM_PICTURE_COLUMNS =
  "id, item_id, photo_path, description, is_primary, sort_order";

/**
 * The pictures in the order they are shown: the primary one first, then
 * whatever order they were put in.
 *
 * The database orders them the same way when it picks the one for the
 * catalogue, so the picture leading this list is the picture in the list.
 */
export function orderPictures(pictures: ItemPicture[]): ItemPicture[] {
  return [...pictures].sort(
    (a, b) =>
      Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
  );
}

/** One row of public.item_catalogue. */
export type CatalogueEntry = {
  id: string;
  code: string | null;
  price_usd: number | null;
  price_khr: number | null;
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
  photo_path: string | null;
  /** The item's code plus every barcode beneath it — what search looks through. */
  codes: string | null;
};

export const ITEM_COLUMNS =
  "id, code, price_usd, price_khr, name_en, name_km, description, category_id, brand_id, active";

export const VARIANT_COLUMNS =
  "id, item_id, barcode, property_name, property_value, photo_path, active, sort_order";

export const CATEGORY_COLUMNS =
  "id, parent_id, name_en, name_km, description, photo_path, active, sort_order";

export const BRAND_COLUMNS =
  "id, name, description, logo_path, active, sort_order";

// One literal, not a concatenation: supabase-js parses this string in the type
// system to work out the row shape, and a joined expression widens to `string`,
// which it can only read back as an error type.
export const CATALOGUE_COLUMNS =
  "id, code, price_usd, price_khr, name_en, name_km, active, category_id, category_name_en, category_name_km, category_parent_id, category_parent_name_en, category_parent_name_km, brand_id, brand_name, variant_count, photo_path, codes";

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
 * Both currencies on one line, or whichever of them is priced.
 *
 * One figure per currency rather than a range: the price belongs to the item,
 * so there is nothing to take a span across.
 */
export function bothPrices(item: {
  price_usd: number | null;
  price_khr: number | null;
}): string {
  const dollars = formatUsd(item.price_usd);
  const riel = formatKhr(item.price_khr);
  return [dollars, riel].filter(Boolean).join(" · ") || "No price yet";
}

/**
 * What to call a variant on screen.
 *
 * The property is what tells one variant from its siblings, so it leads. A
 * variant with no property but a barcode is still identifiable, so the barcode
 * stands in rather than an empty cell. Failing both, the row is the item itself
 * rather than a variation of it, and says so.
 */
export function variantLabel(variant: {
  property_name: string | null;
  property_value: string | null;
  barcode?: string | null;
}): string {
  if (variant.property_name && variant.property_value) {
    return `${variant.property_name}: ${variant.property_value}`;
  }
  return variant.barcode?.trim() || "Standard";
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
    // Every variant's code and barcode, so scanning or typing one finds the
    // item it belongs to.
    entry.codes,
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

// Searching and filtering the reference lists ----------------------------------

/**
 * Whether a list is showing everything, or only what is in use.
 *
 * A catalogue accumulates categories and brands that were right once and are
 * not any more. Deactivating rather than deleting is what keeps the items filed
 * under them readable, so the lists need a way to put that history aside.
 */
export type ActiveFilter = "all" | "active" | "inactive";

export const ACTIVE_FILTERS: { value: ActiveFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

/** The one thing that can be done to an item's status, and what it will do. */
export type ItemStatusAction = {
  label: string;
  icon: string;
  danger: boolean;
  describe: (name: string) => string;
};

/**
 * Withdrawing an item is the destructive half of this pair, so it is the half
 * that is coloured as such and asks first. Restoring one is not, and says only
 * what comes back.
 */
export function itemStatusAction(active: boolean): ItemStatusAction {
  if (active) {
    return {
      label: "Make inactive",
      icon: "square",
      danger: true,
      describe: (name) =>
        `${name} comes out of the catalogue and cannot be sold. Its prices, variants and history stay as they are, and it can be brought back at any time.`,
    };
  }

  return {
    label: "Make active",
    icon: "check",
    danger: false,
    describe: (name) => `${name} goes back into the catalogue and can be sold again.`,
  };
}

export function matchesActive(active: boolean, filter: ActiveFilter): boolean {
  if (filter === "all") return true;
  return filter === "active" ? active : !active;
}

/** Does this category answer the search, in either language? */
export function matchesCategory(category: Category, query: string): boolean {
  const needle = fold(query);
  if (needle === "") return true;
  return [category.name_en, category.name_km, category.description].some(
    (field) => field != null && fold(field).includes(needle),
  );
}

export function matchesBrand(brand: Brand, query: string): boolean {
  const needle = fold(query);
  if (needle === "") return true;
  return [brand.name, brand.description].some(
    (field) => field != null && fold(field).includes(needle),
  );
}

export function filterBrands(
  brands: Brand[],
  query: string,
  filter: ActiveFilter,
): Brand[] {
  return brands.filter((b) => matchesBrand(b, query) && matchesActive(b.active, filter));
}

/** A parent, its surviving children, and whether the parent itself matched. */
export type CategoryBranch = {
  parent: Category;
  children: Category[];
  /** True when the parent answered the search on its own merits. */
  parentMatched: boolean;
};

/**
 * The category tree, searched and filtered.
 *
 * Two rules make this readable rather than surprising:
 *
 *   * A parent that matches keeps all its children, so searching "Grocery"
 *     shows what is under Grocery rather than Grocery alone.
 *   * A parent that does not match survives if any of its children do, because
 *     a sub-category shown without its parent has lost the thing that says
 *     where it sits.
 *
 * The status filter applies to each row on its own: an inactive parent can
 * still carry active children, and hiding those with it would make items look
 * uncategorised when they are not.
 */
export function filterCategoryTree(
  categories: Category[],
  query: string,
  filter: ActiveFilter,
): CategoryBranch[] {
  const branches: CategoryBranch[] = [];

  for (const { parent, children } of categoryTree(categories)) {
    const parentMatched = matchesCategory(parent, query);
    const keptChildren = children.filter(
      (c) => matchesActive(c.active, filter) && (parentMatched || matchesCategory(c, query)),
    );

    const parentKept = parentMatched && matchesActive(parent.active, filter);
    // Kept as context for a child that matched, even when the parent itself is
    // filtered out — otherwise the child appears to belong nowhere.
    if (parentKept || keptChildren.length > 0) {
      branches.push({ parent, children: keptChildren, parentMatched });
    }
  }

  return branches;
}

export function countCategories(branches: CategoryBranch[]): number {
  return branches.reduce(
    (total, branch) => total + branch.children.length + (branch.parentMatched ? 1 : 0),
    0,
  );
}

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
