import { describe, expect, it } from "vitest";
import {
  addableQty,
  byCode,
  cartCount,
  cartEntries,
  cartTotals,
  catalogGroups,
  countCatalog,
  matchesCatalog,
  packingLine,
  priceLine,
  stockState,
  STOCK_LABELS,
  totalsLine,
  type CartLine,
  type CatalogItem,
} from "./catalog";

const item = (over: Partial<CatalogItem> & { id: string }): CatalogItem => ({
  code: null,
  name_en: "Item",
  name_km: null,
  active: true,
  price_usd: null,
  price_khr: null,
  category_id: null,
  category_name_en: null,
  category_name_km: null,
  category_parent_id: null,
  category_parent_name_en: null,
  category_parent_name_km: null,
  brand_id: null,
  brand_name: null,
  photo_path: null,
  description: null,
  stock_qty: 0,
  low_stock_qty: 0,
  qty_per_box: null,
  qty_per_carton: null,
  ...over,
});

describe("stockState", () => {
  it("calls nothing left no stock", () => {
    expect(stockState({ stock_qty: 0, low_stock_qty: 5 })).toBe("none");
  });

  it("warns at or below the level somebody set", () => {
    expect(stockState({ stock_qty: 5, low_stock_qty: 5 })).toBe("low");
    expect(stockState({ stock_qty: 4, low_stock_qty: 5 })).toBe("low");
    expect(stockState({ stock_qty: 6, low_stock_qty: 5 })).toBe("available");
  });

  it("never calls anything low when no level is set", () => {
    // A warning that fires on every item is a warning nobody reads, so zero
    // means "do not warn me" rather than "warn me always".
    expect(stockState({ stock_qty: 1, low_stock_qty: 0 })).toBe("available");
    expect(stockState({ stock_qty: 900, low_stock_qty: 0 })).toBe("available");
  });

  it("still says no stock at zero, whatever the level", () => {
    expect(stockState({ stock_qty: 0, low_stock_qty: 0 })).toBe("none");
  });

  it("has a word for each state", () => {
    expect(STOCK_LABELS.none).toBe("No stock");
    expect(STOCK_LABELS.low).toBe("Low stock");
    expect(STOCK_LABELS.available).toBe("Available");
  });
});

describe("packingLine", () => {
  it("reads both out when both are known", () => {
    expect(packingLine({ qty_per_box: 12, qty_per_carton: 144 })).toBe(
      "12 per box · 144 per carton",
    );
  });

  it("reads whichever half is known", () => {
    expect(packingLine({ qty_per_box: 12, qty_per_carton: null })).toBe("12 per box");
    expect(packingLine({ qty_per_box: null, qty_per_carton: 144 })).toBe("144 per carton");
  });

  it("says nothing about an item nobody has measured", () => {
    expect(packingLine({ qty_per_box: null, qty_per_carton: null })).toBeNull();
  });
});

describe("priceLine", () => {
  it("shows both currencies", () => {
    expect(priceLine({ price_usd: 0.5, price_khr: 2000 })).toBe("$0.50 · ៛2,000");
  });

  it("shows whichever was filled in", () => {
    expect(priceLine({ price_usd: null, price_khr: 2000 })).toBe("៛2,000");
  });

  it("says so plainly when nothing is priced", () => {
    expect(priceLine({ price_usd: null, price_khr: null })).toBe("No price yet");
  });
});

describe("byCode", () => {
  const coded = (id: string, code: string | null, name = "Item") =>
    item({ id, code, name_en: name });

  it("sorts codes ascending", () => {
    const sorted = [coded("b", "HIG-003"), coded("a", "HIG-001")].sort(byCode);
    expect(sorted.map((i) => i.code)).toEqual(["HIG-001", "HIG-003"]);
  });

  it("reads the number in a code as a number", () => {
    // Plain string order puts HIG-10 before HIG-2, which is not what anybody
    // reading a code as a number expects.
    const sorted = [coded("b", "HIG-10"), coded("a", "HIG-2")].sort(byCode);
    expect(sorted.map((i) => i.code)).toEqual(["HIG-2", "HIG-10"]);
  });

  it("puts what has no code last, and then in name order", () => {
    const sorted = [
      coded("c", null, "Zebra"),
      coded("a", "HIG-001"),
      coded("b", null, "Apple"),
    ].sort(byCode);
    expect(sorted.map((i) => i.code ?? i.name_en)).toEqual(["HIG-001", "Apple", "Zebra"]);
  });

  it("ignores case, as a person reading a shelf would", () => {
    const sorted = [coded("b", "hig-002"), coded("a", "HIG-001")].sort(byCode);
    expect(sorted.map((i) => i.code)).toEqual(["HIG-001", "hig-002"]);
  });
});

describe("catalogGroups", () => {
  const drinks = {
    category_id: "drinks",
    category_name_en: "Drinks",
    category_parent_id: "grocery",
    category_parent_name_en: "Grocery",
  };
  const snacks = {
    category_id: "snacks",
    category_name_en: "Snacks",
    category_parent_id: "grocery",
    category_parent_name_en: "Grocery",
  };
  const grocery = { category_id: "grocery", category_name_en: "Grocery" };

  it("puts a sub-category's items under it, inside its parent", () => {
    const groups = catalogGroups([item({ id: "a", code: "A1", ...drinks })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Grocery");
    expect(groups[0].sections.map((s) => s.name)).toEqual(["Drinks"]);
  });

  it("lists the parent's own items first, under no sub-heading", () => {
    // They belong to the whole category rather than to one part of it, so
    // inventing a sub-heading for them would say something untrue.
    const groups = catalogGroups([
      item({ id: "a", code: "A1", ...drinks }),
      item({ id: "b", code: "B1", ...grocery }),
    ]);
    expect(groups[0].sections.map((s) => s.name)).toEqual([null, "Drinks"]);
    expect(groups[0].sections[0].items.map((i) => i.id)).toEqual(["b"]);
  });

  it("orders sub-categories by name", () => {
    const groups = catalogGroups([
      item({ id: "s", code: "S1", ...snacks }),
      item({ id: "d", code: "D1", ...drinks }),
    ]);
    expect(groups[0].sections.map((s) => s.name)).toEqual(["Drinks", "Snacks"]);
  });

  it("orders items inside a section by code", () => {
    const groups = catalogGroups([
      item({ id: "b", code: "HIG-10", ...drinks }),
      item({ id: "a", code: "HIG-2", ...drinks }),
    ]);
    expect(groups[0].sections[0].items.map((i) => i.code)).toEqual(["HIG-2", "HIG-10"]);
  });

  it("orders the categories themselves by name", () => {
    const groups = catalogGroups([
      item({ id: "t", code: "T1", category_id: "tools", category_name_en: "Tools" }),
      item({ id: "g", code: "G1", ...grocery }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Grocery", "Tools"]);
  });

  it("puts what has no category last, whatever it would sort as", () => {
    const groups = catalogGroups([
      item({ id: "n", code: "N1" }),
      item({ id: "t", code: "T1", category_id: "tools", category_name_en: "Tools" }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Tools", "No category"]);
  });

  it("counts what a person can actually see", () => {
    const groups = catalogGroups([
      item({ id: "a", code: "A1", ...drinks }),
      item({ id: "b", code: "B1", ...snacks }),
      item({ id: "c", code: "C1" }),
    ]);
    expect(countCatalog(groups)).toBe(3);
    expect(countCatalog([])).toBe(0);
  });

  it("has nothing to group for an empty catalogue", () => {
    expect(catalogGroups([])).toEqual([]);
  });
});

describe("the cart", () => {
  const water = item({ id: "w", code: "HIG-001", price_usd: 0.5, price_khr: 2000, stock_qty: 10 });
  const rice = item({ id: "r", code: "HIG-002", price_usd: 12, price_khr: null, stock_qty: 4 });
  const line = (item_id: string, quantity: number): CartLine => ({
    id: `l-${item_id}`,
    item_id,
    quantity,
  });

  it("pairs a line with what it is a line of", () => {
    const entries = cartEntries([line("w", 2)], [water, rice]);
    expect(entries).toHaveLength(1);
    expect(entries[0].item.name_en).toBe(water.name_en);
  });

  it("drops a line whose item is gone rather than rendering a blank row", () => {
    // An item retired while it sat in somebody's cart. The line survives in the
    // database until they touch it; it must not survive on screen.
    expect(cartEntries([line("ghost", 1)], [water])).toEqual([]);
  });

  it("orders the cart the way the catalogue is ordered", () => {
    const entries = cartEntries([line("r", 1), line("w", 1)], [water, rice]);
    expect(entries.map((e) => e.item.code)).toEqual(["HIG-001", "HIG-002"]);
  });

  it("counts pieces, not lines", () => {
    expect(cartCount([line("w", 3), line("r", 2)])).toBe(5);
    expect(cartCount([])).toBe(0);
  });

  it("totals each currency on its own", () => {
    // Never converted: the rate is somebody's decision, not this screen's.
    const totals = cartTotals(cartEntries([line("w", 2), line("r", 1)], [water, rice]));
    expect(totals.usd).toBe(13);
    expect(totals.khr).toBe(4000);
  });

  it("leaves a currency null when nothing in the cart carries it", () => {
    const totals = cartTotals(cartEntries([line("r", 1)], [rice]));
    expect(totals.usd).toBe(12);
    expect(totals.khr).toBeNull();
  });

  it("reads an empty cart as nothing rather than as zero", () => {
    expect(cartTotals([])).toEqual({ usd: null, khr: null });
    expect(totalsLine({ usd: null, khr: null })).toBe("—");
  });

  it("writes the total in both currencies", () => {
    expect(totalsLine({ usd: 13, khr: 4000 })).toBe("$13.00 · ៛4,000");
  });
});

describe("addableQty", () => {
  it("stops at what is on the shelf", () => {
    // A catalogue that lets a rep promise forty of something there are six of
    // has cost the company a delivery.
    expect(addableQty(item({ id: "a", stock_qty: 6 }), 0)).toBe(6);
    expect(addableQty(item({ id: "a", stock_qty: 6 }), 4)).toBe(2);
  });

  it("is nothing once the cart holds the lot", () => {
    expect(addableQty(item({ id: "a", stock_qty: 6 }), 6)).toBe(0);
  });

  it("never goes negative, even if the cart somehow outran the stock", () => {
    // Stock can drop while an item sits in a cart, so this is reachable.
    expect(addableQty(item({ id: "a", stock_qty: 2 }), 5)).toBe(0);
  });

  it("is nothing at all for an item out of stock", () => {
    expect(addableQty(item({ id: "a", stock_qty: 0 }), 0)).toBe(0);
  });
});

describe("matchesCatalog", () => {
  const water = item({
    id: "w",
    name_en: "Drinking Water",
    name_km: "ទឹកសុទ្ធ",
    code: "HIG-001",
    brand_name: "Angkor",
  });

  it("matches everything on an empty query", () => {
    expect(matchesCatalog(water, "")).toBe(true);
    expect(matchesCatalog(water, "   ")).toBe(true);
  });

  it("matches the name, the code and the brand", () => {
    expect(matchesCatalog(water, "WATER")).toBe(true);
    expect(matchesCatalog(water, "hig-001")).toBe(true);
    expect(matchesCatalog(water, "angkor")).toBe(true);
  });

  it("matches the Khmer name as typed", () => {
    expect(matchesCatalog(water, "ទឹក")).toBe(true);
  });

  it("does not match something absent", () => {
    expect(matchesCatalog(water, "cement")).toBe(false);
  });
});
