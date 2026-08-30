import { describe, expect, it } from "vitest";
import {
  bothPrices,
  categoryOptions,
  categoryPath,
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
  type Category,
} from "./inventory";

const entry = (over: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id: "i1",
  code: null,
  name_en: "Drinking Water",
  name_km: null,
  active: true,
  category_id: null,
  category_name: null,
  category_parent_id: null,
  category_parent_name: null,
  brand_id: null,
  brand_name: null,
  variant_count: 1,
  min_price_usd: null,
  max_price_usd: null,
  min_price_khr: null,
  max_price_khr: null,
  photo_path: null,
  ...over,
});

const category = (over: Partial<Category> & { id: string; name: string }): Category => ({
  parent_id: null,
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
  it("names the attribute and its value", () => {
    expect(variantLabel({ attribute_name: "Size", attribute_value: "500 ml" })).toBe(
      "Size: 500 ml",
    );
  });

  it("calls the unattributed row what it is", () => {
    // Not an empty cell: this row is the item itself, and it carries the price.
    expect(variantLabel({ attribute_name: null, attribute_value: null })).toBe("Standard");
  });
});

describe("categoryPath", () => {
  it("reads parent then child", () => {
    expect(
      categoryPath({ category_name: "Drinks", category_parent_name: "Grocery" }),
    ).toBe("Grocery / Drinks");
  });

  it("is just the category when it is top level", () => {
    expect(categoryPath({ category_name: "Grocery", category_parent_name: null })).toBe(
      "Grocery",
    );
  });

  it("is null when an item has no category", () => {
    expect(categoryPath({ category_name: null, category_parent_name: null })).toBeNull();
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
    code: "HIG-001",
    brand_name: "Angkor",
    category_name: "Drinks",
    category_parent_name: "Grocery",
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

  it("matches the code, the brand and either category level", () => {
    expect(matchesItem(water, "hig-001")).toBe(true);
    expect(matchesItem(water, "angkor")).toBe(true);
    expect(matchesItem(water, "drinks")).toBe(true);
    expect(matchesItem(water, "grocery")).toBe(true);
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
      category_name: "Drinks",
      category_parent_id: "grocery",
      category_parent_name: "Grocery",
    }),
    entry({
      id: "b",
      name_en: "Rice",
      category_id: "grocery",
      category_name: "Grocery",
    }),
    entry({ id: "c", name_en: "Hammer", category_id: "tools", category_name: "Tools" }),
    entry({ id: "d", name_en: "Odds and ends" }),
  ];

  it("folds a sub-category into its parent's heading", () => {
    // Two levels of heading on a phone leaves no room for the items under them.
    const groups = groupByCategory(rows);
    const grocery = groups.find((g) => g.name === "Grocery");
    expect(grocery?.items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("sorts items within a group by name", () => {
    const groups = groupByCategory(rows);
    expect(groups.find((g) => g.name === "Grocery")?.items.map((i) => i.name_en)).toEqual(
      ["Rice", "Water"],
    );
  });

  it("puts what has no category last, whatever its name", () => {
    const groups = groupByCategory(rows);
    expect(groups.at(-1)?.name).toBe("No category");
  });

  it("filters across the groups rather than flattening them", () => {
    const groups = groupByCategory(rows, "water");
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Grocery");
    expect(countItems(groups)).toBe(1);
  });

  it("comes back empty when nothing matches", () => {
    expect(groupByCategory(rows, "cement")).toEqual([]);
    expect(countItems([])).toBe(0);
  });
});

describe("categoryOptions", () => {
  const categories = [
    category({ id: "tools", name: "Tools", sort_order: 2 }),
    category({ id: "grocery", name: "Grocery", sort_order: 1 }),
    category({ id: "drinks", name: "Drinks", parent_id: "grocery" }),
    category({ id: "snacks", name: "Snacks", parent_id: "grocery" }),
  ];

  it("lists a parent then its children, in sort order", () => {
    expect(categoryOptions(categories).map((o) => o.value)).toEqual([
      "grocery",
      "drinks",
      "snacks",
      "tools",
    ]);
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
    const options = categoryOptions([category({ id: "orphan", name: "Orphan", parent_id: "gone" })]);
    expect(options).toEqual([{ value: "orphan", label: "Orphan" }]);
  });
});

describe("categoryTree", () => {
  it("hangs children off their parent", () => {
    const tree = categoryTree([
      category({ id: "grocery", name: "Grocery" }),
      category({ id: "drinks", name: "Drinks", parent_id: "grocery" }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.id)).toEqual(["drinks"]);
  });

  it("shows a parent with no children as itself", () => {
    const tree = categoryTree([category({ id: "tools", name: "Tools" })]);
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
