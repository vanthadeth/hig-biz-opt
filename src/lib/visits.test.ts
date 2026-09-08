import { describe, expect, it } from "vitest";

import {
  ACCURACY_LIMIT_M,
  checkoutNote,
  dayEnds,
  distanceLabel,
  editWindowLeft,
  editable,
  canNameShop,
  cancelChange,
  cancelProblem,
  cancellable,
  locationProblem,
  openVisit,
  optionsOf,
  provinceOf,
  rangeFlag,
  rangeNote,
  shopNameOf,
  uncancelChange,
  uncancellable,
  usableFix,
  visitLength,
  visitsByDay,
  type PlacedShop,
  type VisitOption,
} from "./visits";

// These assertions are about wording that has an English original; the Khmer
// is checked in the i18n tests, where the dictionary is the subject.
const distanceLabelEn = (m: number | null) => distanceLabel(m, "en");
const rangeNoteEn = (v: Parameters<typeof rangeNote>[0]) => rangeNote(v, "en");

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
    expect(distanceLabelEn(null)).toBe("Distance unknown");
  });

  it("calls anything close enough 'at the shop'", () => {
    expect(distanceLabelEn(0)).toBe("At the shop");
    expect(distanceLabelEn(29)).toBe("At the shop");
  });

  it("rounds metres to something a phone can actually claim", () => {
    expect(distanceLabelEn(183)).toBe("180 m away");
    expect(distanceLabelEn(30)).toBe("30 m away");
  });

  it("and switches to kilometres when it is a journey", () => {
    expect(distanceLabelEn(1500)).toBe("1.5 km away");
    expect(distanceLabelEn(11_200)).toBe("11 km away");
  });
});

/**
 * Four different reasons a visit has no distance on it, and three of them are
 * somebody's to fix: turn location on, pin the shop, or nothing. Saying
 * "unknown" to all four tells a rep which of those to do — none.
 */
describe("what to say about the distance", () => {
  const shop = { shop_name: "Corner Mart", latitude: 11.5564, longitude: 104.9282 };
  const base = {
    customer_id: "c1", customer: shop,
    in_latitude: 11.5564 as number | null,
    out_of_range: false, distance_m: 90 as number | null, radius_m: 200 as number | null,
  };

  it("says nothing at all when the check-in landed inside the radius", () => {
    expect(rangeNoteEn(base)).toBeNull();
  });

  it("names the radius it missed, since the visit was still recorded", () => {
    expect(rangeNoteEn({ ...base, out_of_range: true, distance_m: 1500 }))
      .toBe("Checked in 1.5 km from the shop, outside 200 m.");
  });

  it("a visit to no shop has nothing to measure to", () => {
    expect(rangeNoteEn({ ...base, customer_id: null, customer: null, distance_m: null }))
      .toBe("This visit is not to a shop, so there is no distance to measure.");
  });

  it("a phone that gave no position is the rep's to fix", () => {
    expect(rangeNoteEn({ ...base, in_latitude: null, distance_m: null }))
      .toBe("No location was recorded at check-in, so there is no distance.");
  });

  it("an unpinned shop is the office's to fix", () => {
    expect(rangeNoteEn({
      ...base, distance_m: null,
      customer: { ...shop, latitude: null, longitude: null },
    })).toBe("The shop has no location saved yet.");
  });

  it("says nothing for a named shop with a real pin and a real fix -- that combination now always has a distance (0059)", () => {
    expect(rangeNoteEn({ ...base, distance_m: null })).toBeNull();
  });
});

describe("what a visit calls where it was", () => {
  it("a shop by its name", () => {
    expect(shopNameOf({ customer_id: "c1", customer: { shop_name: "Corner Mart", latitude: null, longitude: null } }, "en"))
      .toBe("Corner Mart");
  });

  it("no shop as a deliberate answer, not a missing one", () => {
    // English here because the default language is Khmer and these assertions
    // are about the shape, not the dictionary; the Khmer path is covered in
    // the i18n tests.
    expect(shopNameOf({ customer_id: null, customer: null }, "en")).toBe("Somewhere else");
  });

  it("and a shop whose record has gone as exactly that", () => {
    expect(shopNameOf({ customer_id: "c1", customer: null }, "en")).toBe("Shop removed");
  });
});

describe("whether a shop can still be named", () => {
  it("yes, while a shopless visit is still open", () => {
    expect(canNameShop({ customer_id: null, checked_out_at: null, cancelled_at: null })).toBe(true);
  });

  it("never once it has closed — naming a shop is not a same-day correction", () => {
    expect(canNameShop({
      customer_id: null, checked_out_at: "2026-09-03T02:00:00Z", cancelled_at: null,
    })).toBe(false);
  });

  it("never once the visit has been called off", () => {
    expect(canNameShop(
      { customer_id: null, checked_out_at: null, cancelled_at: "2026-09-03T02:30:00Z" },
    )).toBe(false);
  });

  it("never when the visit already names one — that would be a swap", () => {
    expect(canNameShop({ customer_id: "c1", checked_out_at: null, cancelled_at: null })).toBe(false);
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
      { id: "a", checked_out_at: "2026-09-03T02:00:00Z", cancelled_at: null },
      { id: "b", checked_out_at: null, cancelled_at: null },
    ];
    expect(openVisit(visits)?.id).toBe("b");
  });

  it("and there need not be one", () => {
    expect(openVisit([{ id: "a", checked_out_at: "2026-09-03T02:00:00Z", cancelled_at: null }]))
      .toBeNull();
    expect(openVisit([])).toBeNull();
  });

  /**
   * A mistaken check-in that was cancelled but never closed must not read as
   * "you are still out somewhere", or it would lock the rep out of checking in
   * again for good. The database's own partial index agrees.
   */
  it("and a cancelled one is not open, whatever its check-out column says", () => {
    expect(openVisit([
      { id: "a", checked_out_at: null, cancelled_at: "2026-09-03T02:00:00Z" },
    ])).toBeNull();

    expect(openVisit([
      { id: "a", checked_out_at: null, cancelled_at: "2026-09-03T02:00:00Z" },
      { id: "b", checked_out_at: null, cancelled_at: null },
    ])?.id).toBe("b");
  });
});

describe("calling a visit off", () => {
  const closed = "2026-09-03T02:00:00Z";
  const at2 = (h: number) => Date.parse(closed) + h * 3_600_000;

  it("insists on a reason, because a bare cancellation explains nothing", () => {
    expect(cancelProblem("")).toMatch(/Say why/);
    expect(cancelProblem("   ")).toMatch(/Say why/);
    expect(cancelProblem("x")).toMatch(/few more words/);
    expect(cancelProblem("Tapped by mistake")).toBeNull();
  });

  it("writes the reason trimmed, with the moment it happened", () => {
    const change = cancelChange("  Wrong shop  ");
    expect(change.cancel_reason).toBe("Wrong shop");
    expect(Number.isNaN(Date.parse(change.cancelled_at))).toBe(false);
  });

  it("can be done while the visit is open", () => {
    expect(cancellable({ cancelled_at: null, checked_out_at: null }, at2(1000))).toBe(true);
  });

  it("and for the day after it closes, like any other correction", () => {
    expect(cancellable({ cancelled_at: null, checked_out_at: closed }, at2(23))).toBe(true);
    expect(cancellable({ cancelled_at: null, checked_out_at: closed }, at2(25))).toBe(false);
  });

  it("but not twice", () => {
    expect(cancellable({ cancelled_at: closed, checked_out_at: closed }, at2(1))).toBe(false);
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

describe("where the leaving happened", () => {
  const closed = {
    checkout_out_of_range: true,
    checkout_distance_m: 9600,
    radius_m: 200,
  };

  it("says nothing when the visit was closed at the shop", () => {
    expect(checkoutNote({ ...closed, checkout_out_of_range: false }, "en")).toBeNull();
  });

  it("and nothing when there was no distance to measure", () => {
    // Whatever caused that has already been said once about the check-in, and
    // saying it twice makes one problem look like two.
    expect(checkoutNote({ ...closed, checkout_distance_m: null }, "en")).toBeNull();
  });

  it("but names the distance and the radius when the rep left from elsewhere", () => {
    expect(checkoutNote(closed, "en"))
      .toBe("Checked out 9.6 km from the shop, outside 200 m.");
  });

  it("and leaves the radius out when the visit never recorded one", () => {
    expect(checkoutNote({ ...closed, radius_m: null }, "en"))
      .toBe("Checked out 9.6 km from the shop.");
  });
});

describe("the one flag a timeline row has room for", () => {
  const both = {
    customer_id: "c1",
    out_of_range: false,
    checkout_out_of_range: false,
    distance_m: 40,
    checkout_distance_m: 60,
  };

  it("is silent when both ends were at the shop", () => {
    expect(rangeFlag(both)).toBe("none");
  });

  it("flags a check-in from somewhere else", () => {
    expect(rangeFlag({ ...both, out_of_range: true })).toBe("away");
  });

  // The pattern the check-out measurement was added to catch: at the door on
  // arrival, and gone by the time the visit was closed.
  it("and a check-out from somewhere else just as loudly", () => {
    expect(rangeFlag({ ...both, checkout_out_of_range: true })).toBe("away");
  });

  it("calls an unmeasured visit unknown, which is not the same as away", () => {
    expect(rangeFlag({ ...both, distance_m: null, checkout_distance_m: null }))
      .toBe("unknown");
  });

  it("but one measured end is enough to know", () => {
    expect(rangeFlag({ ...both, distance_m: null })).toBe("none");
  });

  it("and a visit to nowhere in particular is not unknown, it is not to a shop",
    () => {
      expect(
        rangeFlag({
          ...both, customer_id: null, distance_m: null, checkout_distance_m: null,
        }),
      ).toBe("none");
    });
});

describe("which province a shop is in", () => {
  const provinces = new Map([["12", "Phnom Penh"]]);
  const shop = (over: Partial<PlacedShop>): { customer: PlacedShop } => ({
    customer: {
      shop_name: "Corner Mart", latitude: null, longitude: null,
      province_code: null, province_text: null, ...over,
    },
  });

  it("comes from the code, which spells it the same everywhere", () => {
    expect(provinceOf(shop({ province_code: "12", province_text: "PP" }), provinces))
      .toBe("Phnom Penh");
  });

  it("falls back to what somebody wrote when there is no code", () => {
    expect(provinceOf(shop({ province_text: "Kampot" }), provinces)).toBe("Kampot");
  });

  it("and to that too when the code matches no province we know", () => {
    expect(provinceOf(shop({ province_code: "99", province_text: "Kampot" }), provinces))
      .toBe("Kampot");
  });

  it("is null rather than blank when nobody has said", () => {
    expect(provinceOf(shop({}), provinces)).toBeNull();
    expect(provinceOf(shop({ province_text: "   " }), provinces)).toBeNull();
    expect(provinceOf({ customer: null }, provinces)).toBeNull();
  });
});

describe("the two ends of a listed day", () => {
  const visit = (
    id: string, inAt: string, outAt: string | null, cancelledAt: string | null = null,
  ) => ({ id, checked_in_at: inAt, checked_out_at: outAt, cancelled_at: cancelledAt });

  it("brackets the day with the first arrival and the last leaving", () => {
    expect(
      dayEnds([
        visit("b", "2026-09-03T03:00:00Z", "2026-09-03T04:00:00Z"),
        visit("a", "2026-09-03T01:00:00Z", "2026-09-03T02:00:00Z"),
      ]),
    ).toEqual({
      clockIn: "2026-09-03T01:00:00Z",
      clockOut: "2026-09-03T04:00:00Z",
      open: false,
    });
  });

  it("leaves the day open rather than guessing when somebody left", () => {
    expect(
      dayEnds([
        visit("a", "2026-09-03T01:00:00Z", "2026-09-03T02:00:00Z"),
        visit("b", "2026-09-03T03:00:00Z", null),
      ]),
    ).toEqual({ clockIn: "2026-09-03T01:00:00Z", clockOut: null, open: true });
  });

  it("ignores a visit that was called off, at either end", () => {
    expect(
      dayEnds([
        visit("a", "2026-09-03T00:30:00Z", "2026-09-03T00:40:00Z", "2026-09-03T00:45:00Z"),
        visit("b", "2026-09-03T01:00:00Z", "2026-09-03T02:00:00Z"),
      ]),
    ).toEqual({
      clockIn: "2026-09-03T01:00:00Z",
      clockOut: "2026-09-03T02:00:00Z",
      open: false,
    });
  });

  it("and a day of nothing but cancellations has no ends at all", () => {
    expect(
      dayEnds([
        visit("a", "2026-09-03T00:30:00Z", null, "2026-09-03T00:45:00Z"),
      ]),
    ).toEqual({ clockIn: null, clockOut: null, open: false });
  });
});

describe("taking a cancellation back", () => {
  const closed = "2026-09-03T02:00:00Z";
  const at = (h: number) => Date.parse(closed) + h * 3_600_000;

  it("clears both columns together, because half a state is refused", () => {
    expect(uncancelChange()).toEqual({ cancelled_at: null, cancel_reason: null });
  });

  it("is offered on a cancelled visit inside the correction window", () => {
    expect(
      uncancellable({ cancelled_at: closed, checked_out_at: closed }, at(1)),
    ).toBe(true);
  });

  it("and not on one that was never cancelled", () => {
    expect(
      uncancellable({ cancelled_at: null, checked_out_at: closed }, at(1)),
    ).toBe(false);
  });

  // Measured from the check-out, not from the cancelling: a visit that closed
  // two days ago is settled, and calling it off yesterday does not reopen it.
  it("nor once the day to correct the visit has run out", () => {
    expect(
      uncancellable({ cancelled_at: at(23).toString(), checked_out_at: closed }, at(25)),
    ).toBe(false);
  });
});
