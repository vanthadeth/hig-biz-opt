import { describe, expect, it } from "vitest";

import {
  GAP_FLOOR_M,
  boundsOf,
  gapLine,
  mappableDays,
  padded,
  pinsFor,
  pointsOf,
  routeLines,
  type MapPin,
} from "./mapView";
import type { ReportVisit } from "./visits";

let n = 0;
const call = (
  at: string,
  over: Partial<ReportVisit> = {},
): ReportVisit => ({
  id: `v${n++}`,
  user_id: "u1",
  checked_in_at: `2026-09-${at}+07:00`,
  checked_out_at: null,
  in_latitude: 11.5564, in_longitude: 104.9282,
  distance_m: 90, out_of_range: false,
  user: { full_name: "Sokha Chan" },
  customer: { shop_name: "Corner Mart", latitude: 11.5564, longitude: 104.9282 },
  ...over,
});

const pin = (over: Partial<MapPin> = {}): MapPin => ({
  visitId: "v", at: { latitude: 11.5564, longitude: 104.9282 },
  shop: { latitude: 11.5564, longitude: 104.9282 },
  shopName: "Corner Mart", order: 1,
  checkedInAt: "2026-09-03T01:00:00Z", outOfRange: false, distanceM: 0,
  ...over,
});

describe("a day's calls as pins", () => {
  it("comes back in the order they happened, not the order lists use", () => {
    const pins = pinsFor([
      call("03T15:00:00", { customer: { shop_name: "Third", latitude: 11.5, longitude: 104.9 } }),
      call("03T08:00:00", { customer: { shop_name: "First", latitude: 11.5, longitude: 104.9 } }),
      call("03T11:00:00", { customer: { shop_name: "Second", latitude: 11.5, longitude: 104.9 } }),
    ], "2026-09-03");

    expect(pins.map((p) => p.shopName)).toEqual(["First", "Second", "Third"]);
    expect(pins.map((p) => p.order)).toEqual([1, 2, 3]);
  });

  it("keeps to the Cambodian day, so a late call is not filed under UTC's day", () => {
    // Written in UTC on purpose: six in the evening UTC is one in the morning
    // of the following day in Phnom Penh, and it is the Cambodian day that
    // decides which map the visit appears on.
    const late = { ...call("02T18:00:00"), checked_in_at: "2026-09-02T18:00:00Z" };
    expect(pinsFor([late], "2026-09-03")).toHaveLength(1);
    expect(pinsFor([late], "2026-09-02")).toHaveLength(0);
  });

  it("separates where the rep stood from where the shop is recorded", () => {
    const [p] = pinsFor([call("03T08:00:00", {
      in_latitude: 11.5573, in_longitude: 104.9282,
      customer: { shop_name: "Corner Mart", latitude: 11.5564, longitude: 104.9282 },
    })], "2026-09-03");

    expect(p.at).toEqual({ latitude: 11.5573, longitude: 104.9282 });
    expect(p.shop).toEqual({ latitude: 11.5564, longitude: 104.9282 });
  });

  it("says null for a fix the phone never gave, not nought", () => {
    const [p] = pinsFor([call("03T08:00:00",
      { in_latitude: null, in_longitude: null })], "2026-09-03");
    expect(p.at).toBeNull();
  });

  it("and null for a shop nobody has pinned", () => {
    const [p] = pinsFor([call("03T08:00:00",
      { customer: { shop_name: "Nowhere", latitude: null, longitude: null } })], "2026-09-03");
    expect(p.shop).toBeNull();
    expect(p.shopName).toBe("Nowhere");
  });

  it("names a shop that has since been removed", () => {
    const [p] = pinsFor([call("03T08:00:00", { customer: null })], "2026-09-03");
    expect(p.shopName).toBe("Shop removed");
    expect(p.shop).toBeNull();
  });
});

describe("which days are worth opening a map on", () => {
  it("is the ones with a position on either side of the visit", () => {
    const days = mappableDays([
      call("01T08:00:00"),
      call("02T08:00:00", { in_latitude: null, in_longitude: null }),  // shop still pinned
      call("03T08:00:00", {
        in_latitude: null, in_longitude: null,
        customer: { shop_name: "Nowhere", latitude: null, longitude: null },
      }),
    ]);

    expect(days).toEqual(["2026-09-02", "2026-09-01"]); // newest first, the 3rd left out
  });

  it("and lists each day once however many calls were made", () => {
    expect(mappableDays([call("01T08:00:00"), call("01T14:00:00")]))
      .toEqual(["2026-09-01"]);
  });
});

describe("the box the map opens on", () => {
  it("contains every point, the rep's and the shop's alike", () => {
    const box = boundsOf([
      pin({ at: { latitude: 11.50, longitude: 104.90 }, shop: { latitude: 11.60, longitude: 104.95 } }),
      pin({ at: { latitude: 11.55, longitude: 104.80 }, shop: null }),
    ])!;

    expect(box).toEqual({ south: 11.50, west: 104.80, north: 11.60, east: 104.95 });
  });

  it("is null when there is nothing to show, rather than the middle of the country", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([pin({ at: null, shop: null })])).toBeNull();
  });

  it("counts both of a pin's points", () => {
    expect(pointsOf([pin()])).toHaveLength(2);
    expect(pointsOf([pin({ shop: null })])).toHaveLength(1);
  });
});

describe("padding the box", () => {
  it("adds air proportional to what is being shown", () => {
    const box = padded({ south: 11.0, west: 104.0, north: 12.0, east: 105.0 });
    expect(box.south).toBeCloseTo(10.85, 6);
    expect(box.north).toBeCloseTo(12.15, 6);
  });

  it("and gives a single point a street's worth rather than a rooftop's", () => {
    const box = padded({ south: 11.5, west: 104.9, north: 11.5, east: 104.9 });
    expect(box.north - box.south).toBeCloseTo(0.004, 6); // ≈ 440 m across
    expect(box.east - box.west).toBeCloseTo(0.004, 6);
  });
});

describe("the line from where somebody stood to where the shop is", () => {
  it("is drawn when the two are meaningfully apart", () => {
    const line = gapLine(pin({
      at: { latitude: 11.5564, longitude: 104.9282 },
      shop: { latitude: 11.5664, longitude: 104.9282 },   // ~1.1 km
    }));
    expect(line).toEqual([[11.5564, 104.9282], [11.5664, 104.9282]]);
  });

  it("and not when they are close enough that it would be a smudge", () => {
    // A tenth of the floor: well inside two overlapping markers.
    expect(gapLine(pin({
      at: { latitude: 11.5564, longitude: 104.9282 },
      shop: { latitude: 11.55642, longitude: 104.9282 },
    }))).toBeNull();
    expect(GAP_FLOOR_M).toBe(25);
  });

  it("nor when either end is unknown", () => {
    expect(gapLine(pin({ at: null }))).toBeNull();
    expect(gapLine(pin({ shop: null }))).toBeNull();
  });
});

describe("the route through the day", () => {
  it("joins the check-ins in order", () => {
    const lines = routeLines([
      pin({ at: { latitude: 1, longitude: 1 }, order: 1 }),
      pin({ at: { latitude: 2, longitude: 2 }, order: 2 }),
      pin({ at: { latitude: 3, longitude: 3 }, order: 3 }),
    ]);

    expect(lines).toEqual([[[1, 1], [2, 2], [3, 3]]]);
  });

  it("breaks at a visit with no fix rather than claiming a journey through it", () => {
    const lines = routeLines([
      pin({ at: { latitude: 1, longitude: 1 } }),
      pin({ at: { latitude: 2, longitude: 2 } }),
      pin({ at: null }),
      pin({ at: { latitude: 4, longitude: 4 } }),
      pin({ at: { latitude: 5, longitude: 5 } }),
    ]);

    expect(lines).toEqual([[[1, 1], [2, 2]], [[4, 4], [5, 5]]]);
  });

  it("draws nothing at all for a single call, since one point is not a route", () => {
    expect(routeLines([pin()])).toEqual([]);
    expect(routeLines([])).toEqual([]);
  });

  it("and follows where the rep was, never where the shop is recorded", () => {
    const lines = routeLines([
      pin({ at: { latitude: 1, longitude: 1 }, shop: { latitude: 9, longitude: 9 } }),
      pin({ at: { latitude: 2, longitude: 2 }, shop: { latitude: 8, longitude: 8 } }),
    ]);
    expect(lines).toEqual([[[1, 1], [2, 2]]]);
  });
});
