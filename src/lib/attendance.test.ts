import { describe, expect, it } from "vitest";

import {
  activeShare,
  attendanceDays,
  byPerson,
  decimalHours,
  fillDays,
  groupByMonth,
  groupByWeek,
  hoursMinutes,
  mergeRanges,
  type VisitSpan,
} from "./attendance";

/**
 * All times are written with the +07:00 offset on them, so the day a call
 * belongs to is legible in the test rather than something the reader has to
 * work out. `now` is always passed in; nothing here reads the clock.
 */
const at = (s: string) => `2026-09-${s}+07:00`;
const call = (from: string, to: string | null): VisitSpan => ({
  checkedInAt: at(from),
  checkedOutAt: to === null ? null : at(to),
});

const NOW = Date.parse("2026-09-10T12:00:00+07:00"); // a week later; nothing open

describe("mergeRanges", () => {
  it("leaves ranges that do not touch alone", () => {
    expect(mergeRanges([{ from: 0, to: 10 }, { from: 20, to: 30 }]))
      .toEqual([{ from: 0, to: 10 }, { from: 20, to: 30 }]);
  });

  it("folds an overlap into one", () => {
    expect(mergeRanges([{ from: 0, to: 20 }, { from: 10, to: 30 }]))
      .toEqual([{ from: 0, to: 30 }]);
  });

  it("joins ranges that meet, because nobody stopped working in between", () => {
    expect(mergeRanges([{ from: 0, to: 10 }, { from: 10, to: 20 }]))
      .toEqual([{ from: 0, to: 20 }]);
  });

  it("swallows a range wholly inside another", () => {
    expect(mergeRanges([{ from: 0, to: 100 }, { from: 10, to: 20 }]))
      .toEqual([{ from: 0, to: 100 }]);
  });

  it("does not care what order they arrive in", () => {
    expect(mergeRanges([{ from: 20, to: 30 }, { from: 0, to: 25 }]))
      .toEqual([{ from: 0, to: 30 }]);
  });
});

describe("a day of calls", () => {
  const days = attendanceDays([
    call("03T08:00:00", "03T08:30:00"),
    call("03T10:00:00", "03T10:45:00"),
    call("03T15:00:00", "03T15:20:00"),
  ], NOW);

  it("is one day", () => {
    expect(days).toHaveLength(1);
    expect(days[0].key).toBe("2026-09-03");
    expect(days[0].visits).toBe(3);
  });

  it("clocks in at the first check-in and out at the last check-out", () => {
    expect(days[0].clockIn).toBe("2026-09-03T01:00:00.000Z"); // 08:00 here
    expect(days[0].clockOut).toBe("2026-09-03T08:20:00.000Z"); // 15:20 here
  });

  it("works the whole span, travelling and all", () => {
    expect(hoursMinutes(days[0].workingMs)).toBe("7h 20m");
  });

  it("but is only active inside the shops", () => {
    expect(hoursMinutes(days[0].activeMs)).toBe("1h 35m"); // 30 + 45 + 20
  });

  it("so most of the day was spent getting between them", () => {
    expect(activeShare(days[0])).toBeCloseTo(95 / 440, 5);
  });
});

describe("a call that crosses midnight", () => {
  // Checked in at half eleven at night, out at twenty past twelve.
  const days = attendanceDays([call("03T23:30:00", "04T00:20:00")], NOW);

  it("belongs to both days", () => {
    expect(days.map((d) => d.key)).toEqual(["2026-09-04", "2026-09-03"]);
  });

  it("with the evening's half hour on the evening", () => {
    const third = days.find((d) => d.key === "2026-09-03")!;
    expect(hoursMinutes(third.activeMs)).toBe("30m");
    expect(third.visits).toBe(1);
  });

  it("and the twenty minutes after twelve on the next morning", () => {
    const fourth = days.find((d) => d.key === "2026-09-04")!;
    expect(hoursMinutes(fourth.activeMs)).toBe("20m");
    // The call was made on the third. Counting it again would be two visits
    // to one shop for one conversation.
    expect(fourth.visits).toBe(0);
  });

  it("and neither day claims the other's hours", () => {
    const total = days.reduce((sum, d) => sum + d.activeMs, 0);
    expect(hoursMinutes(total)).toBe("50m");
  });
});

describe("a visit still open", () => {
  const NOON = Date.parse("2026-09-03T12:00:00+07:00");

  it("counts up to now while the rep is in the shop", () => {
    const [day] = attendanceDays([
      call("03T08:00:00", "03T08:30:00"),
      call("03T11:30:00", null),
    ], NOON);

    expect(day.open).toBe(true);
    expect(day.unclosed).toBe(false);
    // The day is not over, so there is no clocking-out time to report.
    expect(day.clockOut).toBeNull();
    expect(hoursMinutes(day.workingMs)).toBe("4h");
    expect(hoursMinutes(day.activeMs)).toBe("1h"); // 30m + the 30m so far
    expect(day.visits).toBe(2);
  });

  it("but on a day that has ended it is somebody who forgot, not somebody working", () => {
    const [day] = attendanceDays([call("03T08:00:00", null)], NOW);

    expect(day.unclosed).toBe(true);
    expect(day.open).toBe(false);
    expect(day.activeMs).toBe(0);
    expect(day.workingMs).toBe(0);
    // The visit happened; only its length is unknown.
    expect(day.visits).toBe(1);
  });

  it("and the day it spoils still reports the calls that were closed", () => {
    const [day] = attendanceDays([
      call("03T08:00:00", "03T08:30:00"),
      call("03T15:00:00", null),
    ], NOW);

    expect(day.unclosed).toBe(true);
    expect(hoursMinutes(day.activeMs)).toBe("30m");
    expect(day.visits).toBe(2);
  });
});

describe("what the maths refuses to be fooled by", () => {
  it("two overlapping visits are not twice the time", () => {
    const [day] = attendanceDays([
      call("03T08:00:00", "03T09:00:00"),
      call("03T08:30:00", "03T09:30:00"),
    ], NOW);

    expect(hoursMinutes(day.activeMs)).toBe("1h 30m"); // not 2h
    expect(hoursMinutes(day.workingMs)).toBe("1h 30m");
  });

  it("active time never exceeds working time", () => {
    const days = attendanceDays([
      call("03T08:00:00", "03T08:30:00"),
      call("03T09:00:00", "03T17:00:00"),
    ], NOW);

    for (const day of days) expect(day.activeMs).toBeLessThanOrEqual(day.workingMs);
  });

  it("a checkout before the checkin is not a visit", () => {
    expect(attendanceDays([call("03T09:00:00", "03T08:00:00")], NOW)).toEqual([]);
  });

  it("nor is a timestamp that is not one", () => {
    expect(attendanceDays([
      { checkedInAt: "not a date", checkedOutAt: null },
      { checkedInAt: at("03T08:00:00"), checkedOutAt: "nonsense" },
    ], NOW)).toEqual([]);
  });

  it("a call that lasted no time is still a call", () => {
    const [day] = attendanceDays([call("03T08:00:00", "03T08:00:00")], NOW);
    expect(day.visits).toBe(1);
    expect(day.activeMs).toBe(0);
    expect(day.clockIn).toBe("2026-09-03T01:00:00.000Z");
  });

  it("and no calls at all are no days", () => {
    expect(attendanceDays([], NOW)).toEqual([]);
  });
});

describe("days come back newest first", () => {
  const days = attendanceDays([
    call("01T08:00:00", "01T09:00:00"),
    call("04T08:00:00", "04T09:00:00"),
    call("02T08:00:00", "02T09:00:00"),
  ], NOW);

  it("so the report opens on the day somebody is asking about", () => {
    expect(days.map((d) => d.key))
      .toEqual(["2026-09-04", "2026-09-02", "2026-09-01"]);
  });
});

describe("filling the gaps", () => {
  const days = attendanceDays([
    call("01T08:00:00", "01T09:00:00"),
    call("03T08:00:00", "03T09:00:00"),
  ], NOW);
  const filled = fillDays(days, "2026-09-01", "2026-09-04");

  it("puts the days off back, so a week reads as a week", () => {
    expect(filled.map((d) => d.key))
      .toEqual(["2026-09-04", "2026-09-03", "2026-09-02", "2026-09-01"]);
  });

  it("with nothing on them", () => {
    const off = filled.find((d) => d.key === "2026-09-02")!;
    expect(off).toMatchObject({ visits: 0, workingMs: 0, activeMs: 0, clockIn: null });
  });

  it("and the worked ones untouched", () => {
    expect(filled.find((d) => d.key === "2026-09-03")!.visits).toBe(1);
  });
});

describe("weeks and months", () => {
  // The first is a Tuesday; the seventh is the following Monday.
  const days = attendanceDays([
    call("01T08:00:00", "01T09:00:00"),
    call("03T08:00:00", "03T10:00:00"),
    call("07T08:00:00", "07T09:00:00"),
  ], NOW);

  it("a week runs Monday to Sunday, keyed by its Monday", () => {
    const weeks = groupByWeek(days);
    expect(weeks.map((w) => w.key)).toEqual(["2026-09-07", "2026-08-31"]);

    const first = weeks.find((w) => w.key === "2026-08-31")!;
    expect(first.daysWorked).toBe(2);
    expect(first.visits).toBe(2);
    expect(hoursMinutes(first.activeMs)).toBe("3h");
  });

  it("a month gathers the lot", () => {
    const [month] = groupByMonth(days);
    expect(month.key).toBe("2026-09");
    expect(month.daysWorked).toBe(3);
    expect(month.visits).toBe(3);
    expect(hoursMinutes(month.activeMs)).toBe("4h");
  });

  it("and a period says when one of its days was left open", () => {
    const withOpen = attendanceDays([
      call("01T08:00:00", "01T09:00:00"),
      call("02T08:00:00", null),
    ], NOW);
    expect(groupByMonth(withOpen)[0].unclosed).toBe(true);
    expect(groupByMonth(days)[0].unclosed).toBe(false);
  });

  it("periods come back newest first as well", () => {
    expect(groupByWeek(days)[0].key).toBe("2026-09-07");
  });
});

describe("byPerson", () => {
  it("keeps each rep's calls apart, because attendance is somebody's", () => {
    const spans: VisitSpan[] = [
      { ...call("01T08:00:00", "01T09:00:00"), userId: "a" },
      { ...call("01T10:00:00", "01T11:00:00"), userId: "b" },
      { ...call("02T08:00:00", "02T09:00:00"), userId: "a" },
    ];
    const people = byPerson(spans);
    expect([...people.keys()].sort()).toEqual(["a", "b"]);
    expect(people.get("a")).toHaveLength(2);
    expect(attendanceDays(people.get("a")!, NOW)).toHaveLength(2);
  });
});

describe("saying a duration out loud", () => {
  it("reads the way somebody would say it", () => {
    expect(hoursMinutes(0)).toBe("0m");
    expect(hoursMinutes(45 * 60_000)).toBe("45m");
    expect(hoursMinutes(60 * 60_000)).toBe("1h");
    expect(hoursMinutes(465 * 60_000)).toBe("7h 45m");
  });

  it("rounds to the minute rather than arguing about seconds", () => {
    expect(hoursMinutes(89_000)).toBe("1m");
    expect(hoursMinutes(91_000)).toBe("2m");
  });

  it("and never reports a negative day", () => {
    expect(hoursMinutes(-5000)).toBe("0m");
    expect(decimalHours(-5000)).toBe(0);
  });

  it("or a decimal with more precision than it has", () => {
    expect(decimalHours(90 * 60_000)).toBe(1.5);
    expect(decimalHours(465 * 60_000)).toBe(7.75);
  });
});

describe("activeShare", () => {
  it("is the fraction of the day spent in front of customers", () => {
    expect(activeShare({ workingMs: 4, activeMs: 1 })).toBe(0.25);
  });

  it("is null when there is no day to divide by, which is not zero", () => {
    expect(activeShare({ workingMs: 0, activeMs: 0 })).toBeNull();
  });

  it("and never more than all of it", () => {
    expect(activeShare({ workingMs: 10, activeMs: 20 })).toBe(1);
  });
});
