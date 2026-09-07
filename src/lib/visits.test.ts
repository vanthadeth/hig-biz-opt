import { describe, expect, it } from "vitest";
import {
  canEditVisit,
  durationLabel,
  editableUntil,
  inPeriod,
  openVisit,
  periodRange,
  summarise,
  visitMinutes,
  VISIT_EDIT_WINDOW_MS,
  type Visit,
} from "./visits";

const visit = (over: Partial<Visit> & { id: string }): Visit => ({
  customer_id: "c1",
  user_id: "u1",
  shop_name: "Sok Heng Mart",
  street_address: null,
  district_text: null,
  province_text: null,
  customer_latitude: null,
  customer_longitude: null,
  rep_name: "Dara Chan",
  checked_in_at: "2026-09-06T02:00:00.000Z",
  checked_in_latitude: null,
  checked_in_longitude: null,
  checked_out_at: "2026-09-06T02:45:00.000Z",
  checked_out_latitude: null,
  checked_out_longitude: null,
  visit_type: "sales_call",
  status: "completed",
  order_status: "ordered",
  payment_status: "paid_in_full",
  next_appointment_date: null,
  remarks: null,
  created_at: "2026-09-06T02:00:00.000Z",
  updated_at: "2026-09-06T02:45:00.000Z",
  ...over,
});

describe("the visit still open", () => {
  it("is the one with no check-out", () => {
    const open = visit({ id: "b", checked_out_at: null });
    expect(openVisit([visit({ id: "a" }), open])?.id).toBe("b");
  });

  it("is nothing at all once every visit is closed", () => {
    // What makes the centre button say "Check in" rather than asking.
    expect(openVisit([visit({ id: "a" }), visit({ id: "b" })])).toBeNull();
  });
});

describe("how long the rep was in the shop", () => {
  it("counts the minutes between the stamps", () => {
    expect(visitMinutes(visit({ id: "a" }))).toBe(45);
  });

  it("has no answer while they are still in there", () => {
    expect(visitMinutes(visit({ id: "a", checked_out_at: null }))).toBeNull();
  });

  it("says it the way a person would", () => {
    expect(durationLabel(45)).toBe("45 min");
    expect(durationLabel(60)).toBe("1 h");
    expect(durationLabel(80)).toBe("1 h 20 min");
    expect(durationLabel(0)).toBe("under a minute");
    expect(durationLabel(null)).toBeNull();
  });
});

describe("the 24 hours a rep has to correct a visit", () => {
  // This mirrors public.guard_visit_edit in 0047. The database is what refuses
  // the write; these cases are what decides whether a button is drawn, and the
  // two have to agree.
  const closedAt = "2026-09-06T02:45:00.000Z";
  const closed = visit({ id: "a", checked_out_at: closedAt });
  const at = (msFromClose: number) => new Date(Date.parse(closedAt) + msFromClose);

  it("is still open, so there is nothing to close yet", () => {
    const open = visit({ id: "a", checked_out_at: null });
    expect(editableUntil(open)).toBeNull();
    expect(canEditVisit(open, at(999 * 60 * 60 * 1000))).toBe(true);
  });

  it("allows an edit a minute before the window shuts", () => {
    expect(canEditVisit(closed, at(VISIT_EDIT_WINDOW_MS - 60_000))).toBe(true);
  });

  it("refuses one a minute after", () => {
    expect(canEditVisit(closed, at(VISIT_EDIT_WINDOW_MS + 60_000))).toBe(false);
  });

  it("lets somebody with reach over other people's records through anyway", () => {
    // The escape hatch is scope, not a flag: 'any' is given on purpose, and a
    // correction to week-old history should be theirs rather than nobody's.
    expect(
      canEditVisit(closed, at(7 * 24 * 60 * 60 * 1000), { anyScope: true }),
    ).toBe(true);
  });

  it("shuts exactly 24 hours after check-out", () => {
    expect(editableUntil(closed)?.toISOString()).toBe("2026-09-07T02:45:00.000Z");
  });
});

describe("the period a report is showing", () => {
  // A Sunday, which is the day the week arithmetic is easiest to get wrong:
  // getDay() calls it 0, and a week that starts on Monday has it at the end.
  const sunday = new Date(2026, 8, 6, 14, 30);

  it("today runs from midnight to midnight", () => {
    const { from, to } = periodRange("today", sunday);
    expect(from).toEqual(new Date(2026, 8, 6));
    expect(to).toEqual(new Date(2026, 8, 7));
  });

  it("puts a Sunday at the end of its week, not the start of the next", () => {
    const { from, to } = periodRange("week", sunday);
    expect(from).toEqual(new Date(2026, 7, 31)); // the Monday
    expect(to).toEqual(new Date(2026, 8, 7));
  });

  it("starts the week on Monday when today is one", () => {
    const monday = new Date(2026, 8, 7, 9, 0);
    const { from, to } = periodRange("week", monday);
    expect(from).toEqual(new Date(2026, 8, 7));
    expect(to).toEqual(new Date(2026, 8, 14));
  });

  it("covers the calendar month, and rolls the year over", () => {
    const { from, to } = periodRange("month", new Date(2026, 11, 20));
    expect(from).toEqual(new Date(2026, 11, 1));
    expect(to).toEqual(new Date(2027, 0, 1));
  });

  it("is half open, so a visit at midnight lands in one period and not two", () => {
    const range = periodRange("today", sunday);
    const midnight = visit({
      id: "a",
      checked_in_at: new Date(2026, 8, 7).toISOString(),
    });
    expect(inPeriod(midnight, range)).toBe(false);

    const justBefore = visit({
      id: "b",
      checked_in_at: new Date(2026, 8, 6, 23, 59).toISOString(),
    });
    expect(inPeriod(justBefore, range)).toBe(true);
  });
});

describe("the four numbers a report leads with", () => {
  it("counts what happened", () => {
    const counts = summarise([
      visit({ id: "a" }),
      visit({ id: "b", status: "shop_closed", order_status: "no_order", payment_status: "no_payment" }),
      visit({ id: "c", order_status: "considering", payment_status: "partial_payment" }),
    ]);

    expect(counts).toEqual({ visits: 3, completed: 2, ordered: 1, collected: 2 });
  });

  it("does not count a shop that owed nothing as a collection", () => {
    // Otherwise a quiet week of courtesy calls reads as a week of collections.
    const counts = summarise([visit({ id: "a", payment_status: "nothing_due" })]);
    expect(counts.collected).toBe(0);
  });

  it("counts a partial payment, because money moved", () => {
    const counts = summarise([visit({ id: "a", payment_status: "partial_payment" })]);
    expect(counts.collected).toBe(1);
  });
});
