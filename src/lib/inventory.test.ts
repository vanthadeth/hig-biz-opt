import { describe, expect, it } from "vitest";
import {
  bothPrices,
  categoryOptions,
  categoryPath,
  ACTIVE_FILTERS,
  categoryLabel,
  countCategories,
  filterBrands,
  filterCategoryTree,
  matchesActive,
  matchesBrand,
  matchesCategory,
  categoryTree,
  countItems,
  formatKhr,
  formatUsd,
  groupByCategory,
  itemTitle,
  matchesItem,
  OPTION_INDENT,
  parsePrice,
  priceRange,
  variantLabel,
  type CatalogueEntry,
  type Brand,
  type Category,
} from "./inventory";

const entry = (over: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id: "i1",
  name_en: "Drinking Water",
  name_km: null,
  active: true,
  category_id: null,
  category_name_en: null,
  category_name_km: null,
  category_parent_id: null,
  category_parent_name_en: null,
  category_parent_name_km: null,
  brand_id: null,
  brand_name: null,
  variant_count: 1,
  min_price_usd: null,
  max_price_usd: null,
  min_price_khr: null,
  max_price_khr: null,
  photo_path: null,
  codes: null,
  ...over,
});

const category = (over: Partial<Category> & { id: string; name_en: string }): Category => ({
  parent_id: null,
  name_km: null,
  description: null,
  photo_path: null,
  active: true,
  sort_order: 0,
  ...over,
});

describe("formatUsd", () => {
  it("keeps the cents, because a price list without them is wrong", () => {
    expect(formatUsd(0.5)).toBe("$0.50");
    expect(formatUsd(12)).toBe("$12.00");
  });

  it("has nothing to say about an unpriced variant", () => {
    expect(formatUsd(null)).toBeNull();
    expect(formatUsd(undefined)).toBeNull();
  });

  it("shows a free item as free rather than as unpriced", () => {
    // Zero is a decision somebody made; null is a blank they have not filled in.
    expect(formatUsd(0)).toBe("$0.00");
  });
});

describe("formatKhr", () => {
  it("groups thousands and drops the decimals riel does not have", () => {
    expect(formatKhr(2000)).toBe("៛2,000");
    expect(formatKhr(1250000)).toBe("៛1,250,000");
  });

  it("has nothing to say about an unpriced variant", () => {
    expect(formatKhr(null)).toBeNull();
  });
});

describe("priceRange", () => {
  it("prints one number when both ends agree", () => {
    expect(priceRange(1.5, 1.5, formatUsd)).toBe("$1.50");
  });

  it("prints a span when they do not", () => {
    expect(priceRange(0.5, 1.25, formatUsd)).toBe("$0.50 – $1.25");
  });

  it("falls back to whichever end is priced", () => {
    expect(priceRange(null, 1.25, formatUsd)).toBe("$1.25");
    expect(priceRange(0.5, null, formatUsd)).toBe("$0.50");
  });

  it("is null when nothing is priced", () => {
    expect(priceRange(null, null, formatUsd)).toBeNull();
  });
});

describe("bothPrices", () => {
  it("puts the two currencies on one line", () => {
    expect(
      bothPrices({
        min_price_usd: 0.5,
        max_price_usd: 1.25,
        min_price_khr: 2000,
        max_price_khr: 5000,
      }),
    ).toBe("$0.50 – $1.25 · ៛2,000 – ៛5,000");
  });

  it("shows whichever currency was filled in", () => {
    expect(
      bothPrices({
        min_price_usd: null,
        max_price_usd: null,
        min_price_khr: 2000,
        max_price_khr: 2000,
      }),
    ).toBe("៛2,000");
  });

  it("says so plainly when nothing is priced", () => {
    expect(
      bothPrices({
        min_price_usd: null,
        max_price_usd: null,
        min_price_khr: null,
        max_price_khr: null,
      }),
    ).toBe("No price yet");
  });
});

describe("variantLabel", () => {
  it("names the property and its value", () => {
    expect(variantLabel({ property_name: "Size", property_value: "500 ml" })).toBe(
      "Size: 500 ml",
    );
  });

  it("falls back to the code, which also identifies one thing on a shelf", () => {
    expect(
      variantLabel({ property_name: null, property_value: null, code: "HIG-001" }),
    ).toBe("HIG-001");
  });

  it("prefers the property over the code when both are there", () => {
    expect(
      variantLabel({ property_name: "Size", property_value: "1.5 L", code: "HIG-002" }),
    ).toBe("Size: 1.5 L");
  });

  it("calls the bare row what it is", () => {
    // Not an empty cell: this row is the item itself, and it carries the price.
    expect(variantLabel({ property_name: null, property_value: null })).toBe("Standard");
    expect(
      variantLabel({ property_name: null, property_value: null, code: "  " }),
    ).toBe("Standard");
  });
});

describe("categoryPath", () => {
  it("reads parent then child", () => {
    expect(
      categoryPath({ category_name_en: "Drinks", category_parent_name_en: "Grocery" }),
    ).toBe("Grocery / Drinks");
  });

  it("is just the category when it is top level", () => {
    expect(categoryPath({ category_name_en: "Grocery", category_parent_name_en: null })).toBe(
      "Grocery",
    );
  });

  it("is null when an item has no category", () => {
    expect(categoryPath({ category_name_en: null, category_parent_name_en: null })).toBeNull();
  });

  it("stays English, because it is a breadcrumb on a chip", () => {
    // Both names at both levels is four words in a space that holds two. The
    // Khmer name is shown where the category is the subject, not here.
    expect(
      categoryPath({ category_name_en: "Drinks", category_parent_name_en: "Grocery" }),
    ).not.toContain("—");
  });
});

describe("categoryLabel", () => {
  it("shows both names when a category has both", () => {
    expect(categoryLabel({ name_en: "Grocery", name_km: "គ្រឿងទេស" })).toBe(
      "Grocery — គ្រឿងទេស",
    );
  });

  it("shows the English name alone when there is no Khmer one", () => {
    expect(categoryLabel({ name_en: "Grocery", name_km: null })).toBe("Grocery");
  });
});

describe("itemTitle", () => {
  it("shows both names when both exist", () => {
    expect(itemTitle({ name_en: "Water", name_km: "ទឹក" })).toBe("Water — ទឹក");
  });

  it("shows the English name alone otherwise", () => {
    expect(itemTitle({ name_en: "Water", name_km: null })).toBe("Water");
  });
});

describe("matchesItem", () => {
  const water = entry({
    name_en: "Drinking Water",
    name_km: "ទឹកសុទ្ធ",
    codes: "HIG-001 8850123456789",
    brand_name: "Angkor",
    category_name_en: "Drinks",
    category_name_km: "ភេសជ្ជៈ",
    category_parent_name_en: "Grocery",
    category_parent_name_km: "គ្រឿងទេស",
  });

  it("matches every item on an empty query", () => {
    expect(matchesItem(water, "")).toBe(true);
    expect(matchesItem(water, "   ")).toBe(true);
  });

  it("matches the English name, ignoring case", () => {
    expect(matchesItem(water, "WATER")).toBe(true);
  });

  it("matches the Khmer name as typed", () => {
    // Khmer has no case to fold, so the same comparison serves both languages.
    expect(matchesItem(water, "ទឹក")).toBe(true);
  });

  it("matches a variant's code or barcode, the brand and either category level", () => {
    expect(matchesItem(water, "hig-001")).toBe(true);
    expect(matchesItem(water, "8850123456789")).toBe(true);
    expect(matchesItem(water, "angkor")).toBe(true);
    expect(matchesItem(water, "drinks")).toBe(true);
    expect(matchesItem(water, "grocery")).toBe(true);
  });

  it("matches a category by its Khmer name too", () => {
    // Somebody who files stock in Khmer searches in Khmer. Finding an item by
    // its own name but not by its category's would be half a translation.
    expect(matchesItem(water, "ភេសជ្ជៈ")).toBe(true);
    expect(matchesItem(water, "គ្រឿងទេស")).toBe(true);
  });

  it("does not match something absent", () => {
    expect(matchesItem(water, "cement")).toBe(false);
  });

  it("survives an item with nothing but a name", () => {
    expect(matchesItem(entry({ name_en: "Bare" }), "bare")).toBe(true);
    expect(matchesItem(entry({ name_en: "Bare" }), "angkor")).toBe(false);
  });
});

describe("groupByCategory", () => {
  const rows = [
    entry({
      id: "a",
      name_en: "Water",
      category_id: "drinks",
      category_name_en: "Drinks",
      category_parent_id: "grocery",
      category_parent_name_en: "Grocery",
    }),
    entry({
      id: "b",
      name_en: "Rice",
      category_id: "grocery",
      category_name_en: "Grocery",
    }),
    entry({ id: "c", name_en: "Hammer", category_id: "tools", category_name_en: "Tools" }),
    entry({ id: "d", name_en: "Odds and ends" }),
  ];

  it("folds a sub-category into its parent's heading", () => {
    // Two levels of heading on a phone leaves no room for the items under them.
    const groups = groupByCategory(rows);
    const grocery = groups.find((g) => g.nameEn === "Grocery");
    expect(grocery?.items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("sorts items within a group by name", () => {
    const groups = groupByCategory(rows);
    expect(groups.find((g) => g.nameEn === "Grocery")?.items.map((i) => i.name_en)).toEqual(
      ["Rice", "Water"],
    );
  });

  it("puts what has no category last, whatever its name", () => {
    const groups = groupByCategory(rows);
    expect(groups.at(-1)?.nameEn).toBe("No category");
  });

  it("takes the Khmer heading from the level that supplied the English one", () => {
    // Otherwise a heading could read as the parent in one language and the
    // child in the other, which is worse than showing no Khmer at all.
    const groups = groupByCategory([
      entry({
        id: "a",
        category_id: "drinks",
        category_name_en: "Drinks",
        category_name_km: "ភេសជ្ជៈ",
        category_parent_id: "grocery",
        category_parent_name_en: "Grocery",
        category_parent_name_km: "គ្រឿងទេស",
      }),
    ]);
    expect(groups[0].nameEn).toBe("Grocery");
    expect(groups[0].nameKm).toBe("គ្រឿងទេស");
  });

  it("heads a top-level group with its own Khmer name", () => {
    const groups = groupByCategory([
      entry({ id: "b", category_id: "tools", category_name_en: "Tools", category_name_km: "ឧបករណ៍" }),
    ]);
    expect(groups[0].nameEn).toBe("Tools");
    expect(groups[0].nameKm).toBe("ឧបករណ៍");
  });

  it("has no Khmer heading for what has no category", () => {
    const groups = groupByCategory([entry({ id: "c" })]);
    expect(groups[0].nameEn).toBe("No category");
    expect(groups[0].nameKm).toBeNull();
  });

  it("filters across the groups rather than flattening them", () => {
    const groups = groupByCategory(rows, "water");
    expect(groups).toHaveLength(1);
    expect(groups[0].nameEn).toBe("Grocery");
    expect(countItems(groups)).toBe(1);
  });

  it("comes back empty when nothing matches", () => {
    expect(groupByCategory(rows, "cement")).toEqual([]);
    expect(countItems([])).toBe(0);
  });
});

describe("categoryOptions", () => {
  const categories = [
    category({ id: "tools", name_en: "Tools", sort_order: 2 }),
    category({ id: "grocery", name_en: "Grocery", sort_order: 1 }),
    category({ id: "drinks", name_en: "Drinks", parent_id: "grocery" }),
    category({ id: "snacks", name_en: "Snacks", parent_id: "grocery" }),
  ];

  it("lists a parent then its children, in sort order", () => {
    expect(categoryOptions(categories).map((o) => o.value)).toEqual([
      "grocery",
      "drinks",
      "snacks",
      "tools",
    ]);
  });

  it("offers both names, so somebody can find a category in either language", () => {
    const options = categoryOptions([
      category({ id: "grocery", name_en: "Grocery", name_km: "គ្រឿងទេស" }),
    ]);
    expect(options[0].label).toBe("Grocery — គ្រឿងទេស");
  });

  it("indents the children so the nesting is visible in a select", () => {
    const options = categoryOptions(categories);
    expect(options[0].label).toBe("Grocery");
    // Non-breaking, because a browser collapses ordinary leading spaces inside
    // an <option> and the indent would come out flush with its parent.
    expect(options[1].label).toBe(`${OPTION_INDENT}Drinks`);
    expect([...OPTION_INDENT].every((c) => c.codePointAt(0) === 0x00a0)).toBe(true);
    expect(OPTION_INDENT.includes(" ")).toBe(false);
  });

  it("still offers a sub-category whose parent is not in the list", () => {
    // Otherwise every item filed under it would be unreachable from the form.
    const options = categoryOptions([category({ id: "orphan", name_en: "Orphan", parent_id: "gone" })]);
    expect(options).toEqual([{ value: "orphan", label: "Orphan" }]);
  });
});

describe("categoryTree", () => {
  it("hangs children off their parent", () => {
    const tree = categoryTree([
      category({ id: "grocery", name_en: "Grocery" }),
      category({ id: "drinks", name_en: "Drinks", parent_id: "grocery" }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.id)).toEqual(["drinks"]);
  });

  it("shows a parent with no children as itself", () => {
    const tree = categoryTree([category({ id: "tools", name_en: "Tools" })]);
    expect(tree[0].children).toEqual([]);
  });
});

describe("parsePrice", () => {
  it("reads a plain number", () => {
    expect(parsePrice("1.25")).toBe(1.25);
    expect(parsePrice("2000")).toBe(2000);
  });

  it("reads a number somebody typed with separators", () => {
    expect(parsePrice("1,250,000")).toBe(1250000);
    expect(parsePrice(" 12 ")).toBe(12);
  });

  it("treats an empty box as no price rather than as zero", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("   ")).toBeNull();
  });

  it("rejects what is not a price, so the form can say so", () => {
    expect(parsePrice("abc")).toBeUndefined();
    expect(parsePrice("-1")).toBeUndefined();
    expect(parsePrice(".")).toBeUndefined();
    expect(parsePrice("1.2.3")).toBeUndefined();
  });

  it("accepts zero, which is a price", () => {
    expect(parsePrice("0")).toBe(0);
  });
});

const brand = (over: Partial<Brand> & { id: string; name: string }): Brand => ({
  description: null,
  logo_path: null,
  active: true,
  sort_order: 0,
  ...over,
});

describe("matchesActive", () => {
  it("lets everything through on All", () => {
    expect(matchesActive(true, "all")).toBe(true);
    expect(matchesActive(false, "all")).toBe(true);
  });

  it("splits the two apart otherwise", () => {
    expect(matchesActive(true, "active")).toBe(true);
    expect(matchesActive(false, "active")).toBe(false);
    expect(matchesActive(false, "inactive")).toBe(true);
    expect(matchesActive(true, "inactive")).toBe(false);
  });

  it("offers exactly the three choices, All first", () => {
    expect(ACTIVE_FILTERS.map((f) => f.value)).toEqual(["all", "active", "inactive"]);
  });
});

describe("matchesCategory", () => {
  const drinks = category({
    id: "d",
    name_en: "Drinks",
    name_km: "ភេសជ្ជៈ",
    description: "Bottled and canned",
  });

  it("matches everything on an empty query", () => {
    expect(matchesCategory(drinks, "")).toBe(true);
    expect(matchesCategory(drinks, "  ")).toBe(true);
  });

  it("matches either language and the description", () => {
    expect(matchesCategory(drinks, "DRINK")).toBe(true);
    expect(matchesCategory(drinks, "ភេសជ្ជៈ")).toBe(true);
    expect(matchesCategory(drinks, "canned")).toBe(true);
  });

  it("does not match something absent", () => {
    expect(matchesCategory(drinks, "hammer")).toBe(false);
  });
});

describe("matchesBrand / filterBrands", () => {
  const brands = [
    brand({ id: "a", name: "Angkor", description: "Brewed in Sihanoukville" }),
    brand({ id: "b", name: "Hanuman", active: false }),
  ];

  it("matches the name and the description", () => {
    expect(matchesBrand(brands[0], "angkor")).toBe(true);
    expect(matchesBrand(brands[0], "sihanoukville")).toBe(true);
    expect(matchesBrand(brands[0], "cement")).toBe(false);
  });

  it("filters by search and status together", () => {
    expect(filterBrands(brands, "", "all").map((b) => b.id)).toEqual(["a", "b"]);
    expect(filterBrands(brands, "", "active").map((b) => b.id)).toEqual(["a"]);
    expect(filterBrands(brands, "", "inactive").map((b) => b.id)).toEqual(["b"]);
    expect(filterBrands(brands, "hanuman", "active")).toEqual([]);
  });
});

describe("filterCategoryTree", () => {
  const tree = [
    category({ id: "grocery", name_en: "Grocery", sort_order: 1 }),
    category({ id: "drinks", name_en: "Drinks", parent_id: "grocery" }),
    category({ id: "snacks", name_en: "Snacks", parent_id: "grocery", active: false }),
    category({ id: "tools", name_en: "Tools", sort_order: 2 }),
    category({ id: "old", name_en: "Discontinued", sort_order: 3, active: false }),
  ];

  it("returns the whole tree when nothing is asked of it", () => {
    const branches = filterCategoryTree(tree, "", "all");
    expect(branches.map((b) => b.parent.id)).toEqual(["grocery", "tools", "old"]);
    expect(branches[0].children.map((c) => c.id)).toEqual(["drinks", "snacks"]);
  });

  it("keeps every child of a parent that matched", () => {
    // Searching "Grocery" should show what is under Grocery, not Grocery alone.
    const branches = filterCategoryTree(tree, "grocery", "all");
    expect(branches).toHaveLength(1);
    expect(branches[0].children.map((c) => c.id)).toEqual(["drinks", "snacks"]);
    expect(branches[0].parentMatched).toBe(true);
  });

  it("keeps a parent as context when only a child matched", () => {
    // A sub-category shown without its parent has lost what says where it sits.
    const branches = filterCategoryTree(tree, "drinks", "all");
    expect(branches).toHaveLength(1);
    expect(branches[0].parent.id).toBe("grocery");
    expect(branches[0].parentMatched).toBe(false);
    expect(branches[0].children.map((c) => c.id)).toEqual(["drinks"]);
  });

  it("filters each row on its own status", () => {
    const branches = filterCategoryTree(tree, "", "active");
    expect(branches.map((b) => b.parent.id)).toEqual(["grocery", "tools"]);
    expect(branches[0].children.map((c) => c.id)).toEqual(["drinks"]);
  });

  it("keeps an inactive parent that still has active children", () => {
    // Hiding those children with it would make their items look uncategorised
    // when they are not.
    const withInactiveParent = [
      category({ id: "p", name_en: "Winding Down", active: false }),
      category({ id: "c", name_en: "Still Selling", parent_id: "p" }),
    ];
    const branches = filterCategoryTree(withInactiveParent, "", "active");
    expect(branches).toHaveLength(1);
    expect(branches[0].parentMatched).toBe(true);
    expect(branches[0].children.map((c) => c.id)).toEqual(["c"]);
  });

  it("shows only what is retired on Inactive", () => {
    const branches = filterCategoryTree(tree, "", "inactive");
    expect(branches.map((b) => b.parent.id)).toEqual(["grocery", "old"]);
    expect(branches[0].children.map((c) => c.id)).toEqual(["snacks"]);
  });

  it("comes back empty when nothing matches", () => {
    expect(filterCategoryTree(tree, "cement", "all")).toEqual([]);
  });

  it("counts the rows a person can actually see", () => {
    // The parent only counts when it matched in its own right; when it is there
    // as context for a child, counting it would overstate the result.
    expect(countCategories(filterCategoryTree(tree, "", "all"))).toBe(5);
    expect(countCategories(filterCategoryTree(tree, "drinks", "all"))).toBe(1);
    expect(countCategories([])).toBe(0);
  });
});
