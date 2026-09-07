import { describe, expect, it } from "vitest";

import {
  ACCURACY_LIMIT_M,
  distanceLabel,
  editWindowLeft,
  editable,
  locationProblem,
  metresBetween,
  nearestShops,
  openVisit,
  optionsOf,
  rangeNote,
  usableFix,
  visitLength,
  visitsByDay,
  type VisitOption,
} from "./visits";

const option = (
  kind: VisitOption["kind"], label: string, sort_order: number, active = true,
): VisitOption => ({ id: `${kind}:${label}`, kind, label, sort_order, active });

describe("the dropdowns", () => {
  const options = [
    option("visit_type", "Delivery", 2),
    option("visit_type", "Sales call", 1),
    option("visit_type", "Old wording", 9, false),
    option("order_status", "Ordered", 1),
  ];

  it("offers one kind at a time, in the order the business set", () => {
    expect(optionsOf(options, "visit_type").map((o) => o.label))
      .toEqual(["Sales call", "Delivery"]);
  });

  it("and never offers a word that has been retired", () => {
    expect(optionsOf(options, "visit_type").map((o) => o.label))
      .not.toContain("Old wording");
  });

  it("falls back on the label when two share a position", () => {
    expect(optionsOf([option("visit_type", "B", 1), option("visit_type", "A", 1)], "visit_type")
      .map((o) => o.label)).toEqual(["A", "B"]);
  });
});

describe("saying a distance", () => {
  it("does not pretend a shop with no pin is underfoot", () => {
    expect(distanceLabel(null)).toBe("Distance unknown");
  });

  it("calls anything close enough 'at the shop'", () => {
    expect(distanceLabel(0)).toBe("At the shop");
    expect(distanceLabel(29)).toBe("At the shop");
  });

  it("rounds metres to something a phone can actually claim", () => {
    expect(distanceLabel(183)).toBe("180 m away");
    expect(distanceLabel(30)).toBe("30 m away");
  });

  it("and switches to kilometres when it is a journey", () => {
    expect(distanceLabel(1500)).toBe("1.5 km away");
    expect(distanceLabel(11_200)).toBe("11 km away");
  });
});

describe("what to say about a check-in that missed", () => {
  it("says nothing at all when it landed inside the radius", () => {
    expect(rangeNote({ out_of_range: false, distance_m: 90, radius_m: 200 })).toBeNull();
  });

  it("names the radius it missed, since the visit was still recorded", () => {
    expect(rangeNote({ out_of_range: true, distance_m: 1500, radius_m: 200 }))
      .toBe("Checked in 1.5 km from the shop, outside 200 m.");
  });

  it("and an unpinned shop is a missing pin, not a missed radius", () => {
    expect(rangeNote({ out_of_range: false, distance_m: null, radius_m: 200 }))
      .toBe("The shop has no location saved yet.");
  });
});

describe("whether a fix is worth sending", () => {
  const fix = { latitude: 11.5564, longitude: 104.9282, accuracy: 12 };

  it("takes a good one", () => {
    expect(usableFix(fix)).toEqual(fix);
  });

  it("refuses one accurate to five kilometres, which is a guess from an address", () => {
    expect(usableFix({ ...fix, accuracy: 5000 })).toBeNull();
    expect(usableFix({ ...fix, accuracy: ACCURACY_LIMIT_M + 1 })).toBeNull();
    expect(usableFix({ ...fix, accuracy: ACCURACY_LIMIT_M })).not.toBeNull();
  });

  it("takes one whose accuracy the browser never said", () => {
    expect(usableFix({ ...fix, accuracy: null })).not.toBeNull();
  });

  it("refuses coordinates that are not on the planet", () => {
    expect(usableFix({ ...fix, latitude: 91 })).toBeNull();
    expect(usableFix({ ...fix, longitude: -181 })).toBeNull();
    expect(usableFix({ ...fix, latitude: Number.NaN })).toBeNull();
  });

  it("and no fix is no fix", () => {
    expect(usableFix(null)).toBeNull();
  });
});

describe("why the phone would not say where it is", () => {
  it("says what to do about it, not what the API called it", () => {
    expect(locationProblem(1)).toMatch(/switched off/);
    expect(locationProblem(2)).toMatch(/outside/);
    expect(locationProblem(3)).toMatch(/too long/);
    expect(locationProblem(null)).toMatch(/could not get a location/);
  });
});

describe("the visit somebody is in the middle of", () => {
  it("is the one with no check-out on it", () => {
    const visits = [
      { id: "a", checked_out_at: "2026-09-03T02:00:00Z" },
      { id: "b", checked_out_at: null },
    ];
    expect(openVisit(visits)?.id).toBe("b");
  });

  it("and there need not be one", () => {
    expect(openVisit([{ id: "a", checked_out_at: "2026-09-03T02:00:00Z" }])).toBeNull();
    expect(openVisit([])).toBeNull();
  });
});

describe("how long a visit lasted", () => {
  const now = Date.parse("2026-09-03T03:00:00Z");

  it("is the two timestamps, once it is closed", () => {
    expect(visitLength({
      checked_in_at: "2026-09-03T01:00:00Z",
      checked_out_at: "2026-09-03T01:30:00Z",
    }, now)).toBe(30 * 60_000);
  });

  it("runs to now while it is open", () => {
    expect(visitLength({
      checked_in_at: "2026-09-03T02:30:00Z", checked_out_at: null,
    }, now)).toBe(30 * 60_000);
  });

  it("and is never negative, whatever the row says", () => {
    expect(visitLength({
      checked_in_at: "2026-09-03T02:00:00Z",
      checked_out_at: "2026-09-03T01:00:00Z",
    }, now)).toBe(0);
    expect(visitLength({ checked_in_at: "rubbish", checked_out_at: null }, now)).toBe(0);
  });
});

describe("visits under day headings", () => {
  it("groups by the Cambodian day, newest day first, newest call first", () => {
    const days = visitsByDay([
      { id: "a", checked_in_at: "2026-09-03T01:00:00Z" }, // 08:00 on the 3rd
      { id: "b", checked_in_at: "2026-09-03T04:00:00Z" }, // 11:00 on the 3rd
      { id: "c", checked_in_at: "2026-09-02T18:00:00Z" }, // 01:00 on the 3rd
      { id: "d", checked_in_at: "2026-09-01T04:00:00Z" },
    ]);

    expect(days.map((d) => d.key)).toEqual(["2026-09-03", "2026-09-01"]);
    // The one at six in the evening UTC is one in the morning here, so it
    // belongs to the 3rd — and is the earliest call of that day.
    expect(days[0].visits.map((v) => v.id)).toEqual(["b", "a", "c"]);
  });
});

describe("the day somebody has to correct a visit", () => {
  const closed = "2026-09-03T02:00:00Z";
  const at = (h: number) => Date.parse(closed) + h * 3_600_000;

  it("an open visit is always open to writing", () => {
    expect(editable({ checked_out_at: null }, at(1000))).toBe(true);
    expect(editWindowLeft({ checked_out_at: null }, at(1000))).toBeNull();
  });

  it("a closed one can be corrected for a day", () => {
    expect(editable({ checked_out_at: closed }, at(1))).toBe(true);
    expect(editable({ checked_out_at: closed }, at(23))).toBe(true);
  });

  it("and not a minute past it", () => {
    expect(editable({ checked_out_at: closed }, at(24))).toBe(false);
    expect(editable({ checked_out_at: closed }, at(25))).toBe(false);
  });

  it("counting down so the form can say how long is left", () => {
    expect(editWindowLeft({ checked_out_at: closed }, at(23))).toBe(3_600_000);
    expect(editWindowLeft({ checked_out_at: closed }, at(30))).toBe(0);
  });
});

describe("the shops a rep is nearest to", () => {
  // Norodom Boulevard, and two shops north of it.
  const fix = { latitude: 11.5564, longitude: 104.9282, accuracy: 10 };
  const near = { id: "near", latitude: 11.5573, longitude: 104.9282 };   // ~100 m
  const far = { id: "far", latitude: 11.5664, longitude: 104.9282 };     // ~1.1 km
  const unpinned = { id: "unpinned", latitude: null, longitude: null };

  it("sorts them by distance", () => {
    expect(nearestShops([far, near], fix).map((r) => r.shop.id)).toEqual(["near", "far"]);
  });

  it("and measures them", () => {
    const [first] = nearestShops([near], fix);
    expect(first.metres).toBeGreaterThan(80);
    expect(first.metres).toBeLessThan(120);
  });

  it("puts shops with no pin last, because unknown is not nearby", () => {
    expect(nearestShops([unpinned, far, near], fix).map((r) => r.shop.id))
      .toEqual(["near", "far", "unpinned"]);
  });

  it("measures nothing at all without a fix", () => {
    const rows = nearestShops([near, far], null);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.metres === null)).toBe(true);
  });

  it("and returns only as many as asked for", () => {
    expect(nearestShops([near, far, unpinned], fix, 2)).toHaveLength(2);
  });
});

describe("metresBetween", () => {
  it("is nothing when nothing moved", () => {
    expect(metresBetween(11.5, 104.9, 11.5, 104.9)).toBe(0);
  });

  /**
   * The numbers on the right were read off `app.metres_between` on the live
   * schema, not worked out here, and they are asserted to the millimetre.
   *
   * This is only used to sort a list of shops before anybody checks in — the
   * distance that gets recorded is always the database's. But a list that
   * disagrees with the record it is about to produce is a list that puts the
   * wrong shop at the top, so the two are held to the same answer.
   */
  it("agrees with the database to the millimetre, a hundred metres out", () => {
    expect(metresBetween(11.5564, 104.9282, 11.5573, 104.9282))
      .toBeCloseTo(100.075433980103, 3);
  });

  it("and eleven hundred", () => {
    expect(metresBetween(11.5, 104.9, 11.51, 104.9))
      .toBeCloseTo(1111.94926644559, 3);
  });

  it("and nine kilometres, out at the airport", () => {
    expect(metresBetween(11.5564, 104.9282, 11.5466, 104.8441))
      .toBeCloseTo(9226.65566279246, 3);
  });
});
