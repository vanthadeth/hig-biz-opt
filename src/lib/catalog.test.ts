import { describe, expect, it } from "vitest";
import {
  addableQty,
  byCode,
  cartCountLine,
  cartItemCount,
  cleanAmount,
  cleanQuantity,
  discountShare,
  lineBefore,
  lineDiscount,
  lineOffShelf,
  lineTotals,
  packChoices,
  quantityLine,
  cartPieceCount,
  cartSavings,
  cleanDiscount,
  customerWhere,
  discountLabel,
  distanceLabel,
  distanceMetres,
  lineTotal,
  nearestCustomers,
  cartEntries,
  cartTotals,
  catalogGroups,
  countCatalog,
  matchesCatalog,
  packingLine,
  stockState,
  STOCK_LABELS,
  type CartLine,
  type CatalogItem,
} from "./catalog";

const item = (over: Partial<CatalogItem> & { id: string }): CatalogItem => ({
  code: null,
  name: "Item",
  name_alt: null,
  active: true,
  price_usd: null,
  price_khr: null,
  category_id: null,
  category_name: null,
  category_name_alt: null,
  category_parent_id: null,
  category_parent_name: null,
  category_parent_name_alt: null,
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

describe("byCode", () => {
  const coded = (id: string, code: string | null, name = "Item") =>
    item({ id, code, name: name });

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
    expect(sorted.map((i) => i.code ?? i.name)).toEqual(["HIG-001", "Apple", "Zebra"]);
  });

  it("ignores case, as a person reading a shelf would", () => {
    const sorted = [coded("b", "hig-002"), coded("a", "HIG-001")].sort(byCode);
    expect(sorted.map((i) => i.code)).toEqual(["HIG-001", "hig-002"]);
  });
});

describe("catalogGroups", () => {
  const drinks = {
    category_id: "drinks",
    category_name: "Drinks",
    category_parent_id: "grocery",
    category_parent_name: "Grocery",
  };
  const snacks = {
    category_id: "snacks",
    category_name: "Snacks",
    category_parent_id: "grocery",
    category_parent_name: "Grocery",
  };
  const grocery = { category_id: "grocery", category_name: "Grocery" };

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
      item({ id: "t", code: "T1", category_id: "tools", category_name: "Tools" }),
      item({ id: "g", code: "G1", ...grocery }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Grocery", "Tools"]);
  });

  it("puts what has no category last, whatever it would sort as", () => {
    const groups = catalogGroups([
      item({ id: "n", code: "N1" }),
      item({ id: "t", code: "T1", category_id: "tools", category_name: "Tools" }),
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
  const line = (
    item_id: string,
    quantity: number,
    discount_percent = 0,
    extra: Partial<CartLine> = {},
  ): CartLine => ({
    id: `l-${item_id}`,
    item_id,
    quantity,
    free_quantity: 0,
    discount_mode: "percent",
    discount_percent,
    discount_amount: 0,
    ...extra,
  });

  it("pairs a line with what it is a line of", () => {
    const entries = cartEntries([line("w", 2)], [water, rice]);
    expect(entries).toHaveLength(1);
    expect(entries[0].item.name).toBe(water.name);
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

  it("counts items for the badge, not pieces", () => {
    // What a rep glances at is "how long is this order". Twelve of one thing
    // reads as a list of twelve to somebody who has not opened the cart.
    expect(cartItemCount([line("w", 12)])).toBe(1);
    expect(cartItemCount([line("w", 3), line("r", 2)])).toBe(2);
    expect(cartItemCount([])).toBe(0);
  });

  it("counts pieces too, for inside the cart", () => {
    expect(cartPieceCount([line("w", 3), line("r", 2)])).toBe(5);
    expect(cartPieceCount([])).toBe(0);
  });

  it("says both numbers, unless they are the same number", () => {
    expect(cartCountLine([line("w", 3), line("r", 2)])).toBe("2 items · 5 pieces");
    // One of each: saying "2 items · 2 pieces" is saying it twice.
    expect(cartCountLine([line("w", 1), line("r", 1)])).toBe("2 items");
    expect(cartCountLine([line("w", 1)])).toBe("1 item");
    expect(cartCountLine([line("w", 2)])).toBe("1 item · 2 pieces");
  });

  it("totals each currency on its own", () => {
    // Never converted: the rate is somebody's decision, not this screen's.
    const totals = cartTotals(cartEntries([line("w", 2), line("r", 1)], [water, rice]));
    expect(totals.usd).toBe(13);
    expect(totals.khr).toBe(4000);
  });

  it("takes each line's discount off before totalling", () => {
    // 2 x 0.50 less a tenth is 0.90; 1 x 12.00 less a half is 6.00.
    const totals = cartTotals(
      cartEntries([line("w", 2, 10), line("r", 1, 50)], [water, rice]),
    );
    expect(totals.usd).toBe(6.9);
    expect(totals.khr).toBe(3600);
  });

  it("says what the discounts came to", () => {
    const savings = cartSavings(cartEntries([line("w", 2, 10)], [water, rice]));
    expect(savings.usd).toBeCloseTo(0.1, 10);
    expect(savings.khr).toBe(400);
  });

  it("says nothing when nothing was discounted", () => {
    // Null, not zero: "0.00 off" on an undiscounted cart is a line of noise.
    expect(cartSavings(cartEntries([line("w", 2)], [water, rice]))).toEqual({
      usd: null,
      khr: null,
    });
  });

  it("leaves a currency null when nothing in the cart carries it", () => {
    const totals = cartTotals(cartEntries([line("r", 1)], [rice]));
    expect(totals.usd).toBe(12);
    expect(totals.khr).toBeNull();
  });

  it("reads an empty cart as nothing rather than as zero", () => {
    expect(cartTotals([])).toEqual({ usd: null, khr: null });
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
    name: "Drinking Water",
    name_alt: "ទឹកសុទ្ធ",
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

describe("a discount", () => {
  it("is a percent between none and all of it", () => {
    expect(cleanDiscount(-5)).toBe(0);
    expect(cleanDiscount(150)).toBe(100);
    expect(cleanDiscount(12.5)).toBe(12.5);
  });

  it("keeps two places and no more", () => {
    expect(cleanDiscount(12.345)).toBe(12.35);
  });

  it("reads a typo as no discount rather than as a wrong one", () => {
    expect(cleanDiscount(Number.NaN)).toBe(0);
    expect(cleanDiscount(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("rounds the line, so the lines add up to the total", () => {
    // Rounded here rather than at the total: the line is what gets read back
    // to the shopkeeper, and a total that is not the lines added up is a
    // total nobody trusts.
    expect(lineTotal(0.5, 3, 10, 2)).toBe(1.35);
    expect(lineTotal(2000, 3, 10, 0)).toBe(5400);
  });

  it("has no total for a price that does not exist", () => {
    expect(lineTotal(null, 3, 10, 2)).toBeNull();
  });

  it("is only mentioned when there is one", () => {
    expect(discountLabel(0)).toBeNull();
    expect(discountLabel(10)).toBe("10% off");
    // "12.50% off" is a machine talking.
    expect(discountLabel(12.5)).toBe("12.5% off");
  });
});

describe("choosing who the cart is for", () => {
  const shop = (
    id: string,
    shop_name: string,
    latitude: number | null = null,
    longitude: number | null = null,
  ) => ({
    id,
    shop_name,
    street_address: null,
    province_text: null,
    district_text: null,
    latitude,
    longitude,
  });

  // Phnom Penh, roughly.
  const here = { latitude: 11.5564, longitude: 104.9282 };
  const near = shop("n", "Near Shop", 11.5574, 104.9282); // ~110 m north
  const far = shop("f", "Far Shop", 11.6564, 104.9282); // ~11 km north
  const unknown = shop("u", "Aardvark Hardware");

  it("puts the shop you are standing in first", () => {
    const order = nearestCustomers([far, near], here).map((c) => c.id);
    expect(order).toEqual(["n", "f"]);
  });

  it("falls back to names when the phone does not know where it is", () => {
    // A refusal, no signal, a browser that never asked: all the same answer.
    const order = nearestCustomers([far, near, unknown], null).map((c) => c.id);
    expect(order).toEqual(["u", "f", "n"]);
  });

  it("puts a shop with no coordinates after every shop that has them", () => {
    // Unknown is not the same as far away, and must not sort as zero either.
    const order = nearestCustomers([unknown, far, near], here).map((c) => c.id);
    expect(order).toEqual(["n", "f", "u"]);
  });

  it("measures roughly the right distance", () => {
    expect(distanceMetres(here, near)).toBeGreaterThan(90);
    expect(distanceMetres(here, near)).toBeLessThan(130);
    expect(distanceMetres(here, unknown)).toBeNull();
  });

  it("says the distance the way somebody would", () => {
    expect(distanceLabel(110)).toBe("110 m");
    expect(distanceLabel(4300)).toBe("4.3 km");
    expect(distanceLabel(43_000)).toBe("43 km");
    expect(distanceLabel(null)).toBeNull();
  });

  it("says where a shop is, skipping what nobody filled in", () => {
    expect(
      customerWhere({
        ...near,
        street_address: "12 Street 271",
        district_text: "Chamkar Mon",
        province_text: null,
      }),
    ).toBe("12 Street 271, Chamkar Mon");
    expect(customerWhere(near)).toBeNull();
  });
});

describe("giving some away", () => {
  const line = (quantity: number, free_quantity: number) => ({ quantity, free_quantity });

  it("takes the free ones off the shelf too", () => {
    // Buy ten, two free, is twelve leaving the warehouse. A picker packing
    // twelve against an order that says ten is a dispute waiting to happen.
    expect(lineOffShelf(line(10, 2))).toBe(12);
    expect(lineOffShelf(line(10, 0))).toBe(10);
  });

  it("says both numbers where there are two", () => {
    expect(quantityLine(10, 2)).toBe("10 + 2 free");
    expect(quantityLine(10, 0)).toBe("10");
  });

  it("counts whole things, and not fewer than none", () => {
    expect(cleanQuantity(3.7)).toBe(3);
    expect(cleanQuantity(-4)).toBe(0);
    expect(cleanQuantity(Number.NaN)).toBe(0);
    expect(cleanQuantity(500, 12)).toBe(12);
  });
});

describe("a discount given in money", () => {
  const priced = { price_usd: 10, price_khr: 41000 };

  it("becomes the share of the line it takes off", () => {
    // $2 off ten at $10 is 2%. This must match app.discount_share exactly: the
    // cart screen and the order it becomes have to agree about the number.
    expect(discountShare({ mode: "amount", percent: 0, amount: 2 }, 10, 10)).toBe(2);
  });

  it("takes the same share off the riel side of the line", () => {
    // Not a conversion — this app has no rate. The same fraction, applied to
    // the price that is already in riel.
    const totals = lineTotals(priced, 10, { mode: "amount", percent: 0, amount: 2 });
    expect(totals.usd).toBe(98);
    expect(totals.khr).toBe(401_800);
  });

  it("is the whole line when it is bigger than the line, never a refund", () => {
    expect(discountShare({ mode: "amount", percent: 0, amount: 999 }, 10, 10)).toBe(100);
    expect(lineTotals(priced, 10, { mode: "amount", percent: 0, amount: 999 }).usd).toBe(0);
  });

  it("takes nothing off an item with no dollar price", () => {
    // Nothing for it to be a share of. No discount at all, rather than all of
    // it, which is the failure that would give the stock away.
    expect(discountShare({ mode: "amount", percent: 0, amount: 5 }, null, 10)).toBe(0);
    const riel = { price_usd: null, price_khr: 8000 };
    expect(lineTotals(riel, 5, { mode: "amount", percent: 0, amount: 5 }).khr).toBe(40_000);
  });

  it("ignores the percent it is not using, and the other way round", () => {
    // The database refuses a row carrying both; this is the same rule read
    // from the other side.
    expect(discountShare({ mode: "amount", percent: 90, amount: 2 }, 10, 10)).toBe(2);
    expect(discountShare({ mode: "percent", percent: 10, amount: 99 }, 10, 10)).toBe(10);
  });

  it("rounds money to the cent and refuses a negative", () => {
    expect(cleanAmount(2.345)).toBe(2.35);
    expect(cleanAmount(-2)).toBe(0);
    expect(cleanAmount(Number.NaN)).toBe(0);
  });

  it("prices the line before any of it, for showing what was saved", () => {
    expect(lineBefore(priced, 10)).toEqual({ usd: 100, khr: 410_000 });
  });

  it("reads a line's own discount back", () => {
    expect(
      lineDiscount({ discount_mode: "amount", discount_percent: 0, discount_amount: 2 }),
    ).toEqual({ mode: "amount", percent: 0, amount: 2 });
  });
});

describe("the quantities worth one tap", () => {
  const packed = { qty_per_box: 12, qty_per_carton: 144 };

  it("offers the single, the box and the carton", () => {
    expect(packChoices(packed).map((p) => `${p.label} ${p.quantity}`)).toEqual([
      "Single 1",
      "Box 12",
      "Carton 144",
    ]);
  });

  it("leads with the box, because that is how these go out of the door", () => {
    expect(packChoices(packed).find((p) => p.lead)?.label).toBe("Box");
  });

  it("leads with the single when there is no box", () => {
    const choices = packChoices({ qty_per_box: null, qty_per_carton: null });
    expect(choices.map((p) => p.label)).toEqual(["Single"]);
    expect(choices[0].lead).toBe(true);
  });

  it("does not offer the same number twice", () => {
    // "Box 1" next to "Single 1" is two buttons that do the same thing.
    expect(packChoices({ qty_per_box: 1, qty_per_carton: 1 }).map((p) => p.label)).toEqual([
      "Single",
    ]);
  });

  it("keeps the carton when only that is recorded", () => {
    expect(
      packChoices({ qty_per_box: null, qty_per_carton: 48 }).map((p) => p.quantity),
    ).toEqual([1, 48]);
  });
});
