import { describe, expect, it } from "vitest";
import {
  customerWhere,
  distanceLabel,
  distanceMetres,
  nearestCustomers,
} from "./geo";

// These cases moved here with the functions, from catalog.test.ts. Both the
// cart's customer picker and My Visit's check-in list are asking the same
// question, so the answer is tested once.
describe("choosing the shop you are standing in", () => {
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
