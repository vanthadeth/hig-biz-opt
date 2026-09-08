import { describe, expect, it } from "vitest";

import {
  NO_QUOTA,
  anyTarget,
  barsFor,
  effectiveQuota,
  hoursMs,
  numberOrNull,
  quotaProblem,
  targetFor,
  totalsOfDay,
  totalsOfPeriod,
  type Quota,
} from "./quota";

const HOUR = 3_600_000;

const quota = (over: Partial<Quota> = {}): Quota => ({ ...NO_QUOTA, ...over });

describe("a business that has decided nothing", () => {
  it("manages nothing, at either scope", () => {
    expect(anyTarget(NO_QUOTA, "daily")).toBe(false);
    expect(anyTarget(NO_QUOTA, "weekly")).toBe(false);
  });

  // The point of the whole null-means-unmanaged rule: no bar, rather than a
  // bar at nothing, which would read as a target somebody is failing.
  it("and draws no bars at all", () => {
    expect(barsFor({ visits: 4, workingMs: 6 * HOUR, activeMs: 2 * HOUR }, NO_QUOTA, "daily"))
      .toEqual([]);
  });

  it("even one figure being managed is enough to show the snapshot", () => {
    expect(anyTarget(quota({ daily_visit_target: 8 }), "daily")).toBe(true);
    expect(anyTarget(quota({ daily_visit_target: 8 }), "weekly")).toBe(false);
  });
});

describe("what a target is worth in the measure's own unit", () => {
  it("visits are a count and hours are milliseconds", () => {
    const q = quota({ daily_visit_target: 8, daily_working_hours: 8.5 });
    expect(targetFor(q, "daily", "visits")).toBe(8);
    expect(targetFor(q, "daily", "working")).toBe(8.5 * HOUR);
    expect(targetFor(q, "daily", "active")).toBeNull();
  });

  it("the week is its own number, never five times the day", () => {
    const q = quota({ daily_visit_target: 8, weekly_visit_target: 44 });
    expect(targetFor(q, "weekly", "visits")).toBe(44);
  });

  it("half an hour survives the conversion", () => {
    expect(hoursMs(0.5)).toBe(1_800_000);
    expect(hoursMs(null)).toBeNull();
  });
});

describe("the bars a day is drawn against", () => {
  const q = quota({
    daily_visit_target: 8,
    daily_working_hours: 8,
    daily_active_hours: 4,
  });

  it("come in the order they are read: shops, then the day, then the shops within it", () => {
    const bars = barsFor({ visits: 2, workingMs: 2 * HOUR, activeMs: HOUR }, q, "daily");
    expect(bars.map((bar) => bar.measure)).toEqual(["visits", "working", "active"]);
  });

  it("say how far along in per cent", () => {
    const [visits] = barsFor({ visits: 2, workingMs: 0, activeMs: 0 }, q, "daily");
    expect(visits.percent).toBe(25);
    expect(visits.met).toBe(false);
  });

  // The bar is the shape; the figures beside it are the record. Clipping the
  // ninth call would hide the best thing that happened today.
  it("stop at full without shortening the count behind them", () => {
    const [visits] = barsFor({ visits: 9, workingMs: 0, activeMs: 0 }, q, "daily");
    expect(visits.percent).toBe(100);
    expect(visits.done).toBe(9);
    expect(visits.target).toBe(8);
    expect(visits.met).toBe(true);
  });

  it("count a target exactly reached as met", () => {
    const [visits] = barsFor({ visits: 8, workingMs: 0, activeMs: 0 }, q, "daily");
    expect(visits.met).toBe(true);
  });

  it("skip the measures nobody manages", () => {
    const bars = barsFor(
      { visits: 2, workingMs: HOUR, activeMs: HOUR },
      quota({ daily_working_hours: 8 }),
      "daily",
    );
    expect(bars.map((bar) => bar.measure)).toEqual(["working"]);
  });

  // Eight in the morning, before anything has happened: every managed bar at
  // nothing is the true state, not a missing one.
  it("draw a day nobody has started at nothing", () => {
    const bars = barsFor(null, q, "daily");
    expect(bars).toHaveLength(3);
    expect(bars.every((bar) => bar.done === 0 && bar.percent === 0)).toBe(true);
  });
});

describe("where the figures come from", () => {
  it("a day carries its own", () => {
    expect(
      totalsOfDay({
        key: "2026-09-07", clockIn: null, clockOut: null,
        workingMs: 3 * HOUR, activeMs: HOUR, visits: 2, open: false, unclosed: false,
      }),
    ).toEqual({ visits: 2, workingMs: 3 * HOUR, activeMs: HOUR });
    expect(totalsOfDay(null)).toBeNull();
  });

  it("and a week the sum the attendance grouping already made", () => {
    expect(
      totalsOfPeriod({
        key: "2026-09-07", days: [], workingMs: 30 * HOUR, activeMs: 12 * HOUR,
        visits: 21, daysWorked: 5, unclosed: false,
      }),
    ).toEqual({ visits: 21, workingMs: 30 * HOUR, activeMs: 12 * HOUR });
    expect(totalsOfPeriod(null)).toBeNull();
  });
});

describe("what the settings screen may be told", () => {
  it("accepts a quota inside the limits the table itself keeps", () => {
    expect(quotaProblem(quota({ daily_visit_target: 8, daily_working_hours: 8.5 })))
      .toBeNull();
  });

  it("refuses a target of nothing, which is not a target", () => {
    expect(quotaProblem(quota({ daily_visit_target: 0 })))
      .toBe("Keep visits a day between 1 and 100.");
  });

  it("and a day longer than a day", () => {
    expect(quotaProblem(quota({ daily_working_hours: 25 })))
      .toBe("Keep working hours a day between 0.5 and 24.");
  });

  // The two numbers somebody would otherwise spend an afternoon explaining.
  it("refuses more time inside shops than there is working day to hold it", () => {
    expect(
      quotaProblem(quota({ daily_working_hours: 8, daily_active_hours: 9 })),
    ).toBe("Active hours cannot be more than working hours in a day.");
  });

  it("and says which of the two scopes disagrees", () => {
    expect(
      quotaProblem(quota({ weekly_working_hours: 48, weekly_active_hours: 60 })),
    ).toBe("Active hours cannot be more than working hours in a week.");
  });

  it("but has no opinion about a pair where one half is unmanaged", () => {
    expect(quotaProblem(quota({ daily_active_hours: 9 }))).toBeNull();
  });

  it("and none at all about a business managing nothing", () => {
    expect(quotaProblem(NO_QUOTA)).toBeNull();
  });
});

describe("an empty box", () => {
  // "Not managed" and "zero" are different answers, and the table refuses the
  // second one — so the box must not quietly turn the first into it.
  it("is not managed, which is not zero", () => {
    expect(numberOrNull("")).toBeNull();
    expect(numberOrNull("   ")).toBeNull();
  });

  it("a number is a number", () => {
    expect(numberOrNull("8")).toBe(8);
    expect(numberOrNull(" 8.5 ")).toBe(8.5);
  });

  it("and anything else is refused rather than read as nothing", () => {
    expect(numberOrNull("eight")).toBeNaN();
    expect(quotaProblem(quota({ daily_visit_target: numberOrNull("eight") })))
      .toBe("That is not a number.");
  });
});

describe("a rep's own target, laid over the company's", () => {
  const org = quota({ daily_visit_target: 8, daily_working_hours: 8, weekly_visit_target: 44 });

  it("keeps the company figure where nobody has overridden it", () => {
    expect(effectiveQuota(NO_QUOTA, org)).toEqual(org);
  });

  it("takes the rep's own figure, field by field, where one is set", () => {
    const mine = quota({ daily_visit_target: 12 });
    expect(effectiveQuota(mine, org)).toEqual(
      quota({ daily_visit_target: 12, daily_working_hours: 8, weekly_visit_target: 44 }),
    );
  });

  // A rep whose day is set individually but whose week still follows the
  // company figure is the ordinary case, not an edge one.
  it("mixes fields freely rather than choosing one row or the other whole", () => {
    const mine = quota({ daily_visit_target: 12, weekly_visit_target: 60 });
    const merged = effectiveQuota(mine, org);
    expect(merged.daily_visit_target).toBe(12);
    expect(merged.weekly_visit_target).toBe(60);
    expect(merged.daily_working_hours).toBe(8);
  });

  it("stays unmanaged where neither side has decided", () => {
    expect(effectiveQuota(NO_QUOTA, NO_QUOTA)).toEqual(NO_QUOTA);
  });
});
