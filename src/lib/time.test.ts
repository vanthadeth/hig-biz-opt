import { describe, expect, it } from "vitest";

import {
  addDays,
  dayEndMs,
  dayKey,
  dayStartMs,
  daysBetween,
  daysSince,
  longDay,
  monthKey,
  monthLabel,
  shortDay,
  timeOf,
  weekKey,
  weekLabel,
} from "./time";

/**
 * Cambodia sits seven hours ahead of UTC, so every one of these is really the
 * same question: does an instant land on the day a person in Phnom Penh would
 * say it landed on. Getting that wrong is not a formatting bug — it moves
 * somebody's working hours onto the wrong day.
 */
describe("dayKey and timeOf", () => {
  it("reads an instant in Cambodian time", () => {
    expect(dayKey("2026-09-03T01:30:00Z")).toBe("2026-09-03");
    expect(timeOf("2026-09-03T01:30:00Z")).toBe("08:30");
  });

  it("puts the late evening on the day it is there, not in UTC", () => {
    // Six in the evening UTC is one in the morning of the following day here.
    expect(dayKey("2026-09-02T18:00:00Z")).toBe("2026-09-03");
    expect(timeOf("2026-09-02T18:00:00Z")).toBe("01:00");
  });
});

describe("the bounds of a day", () => {
  it("begins at midnight here, which is five in the evening UTC", () => {
    expect(new Date(dayStartMs("2026-09-03")).toISOString())
      .toBe("2026-09-02T17:00:00.000Z");
  });

  it("and ends where the next one begins", () => {
    expect(dayEndMs("2026-09-03")).toBe(dayStartMs("2026-09-04"));
    expect(dayEndMs("2026-09-03") - dayStartMs("2026-09-03")).toBe(86_400_000);
  });

  it("round-trips: every instant inside a day reads as that day", () => {
    const start = dayStartMs("2026-09-03");
    expect(dayKey(start)).toBe("2026-09-03");
    expect(dayKey(start + 86_399_999)).toBe("2026-09-03");
    expect(dayKey(start - 1)).toBe("2026-09-02");
  });
});

describe("walking the calendar", () => {
  it("steps over the end of a month", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("and over the end of a year", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("knows February in a leap year", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("lists a stretch of days inclusively", () => {
    expect(daysBetween("2026-09-01", "2026-09-04")).toEqual([
      "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
    ]);
    expect(daysBetween("2026-09-01", "2026-09-01")).toEqual(["2026-09-01"]);
    expect(daysBetween("2026-09-02", "2026-09-01")).toEqual([]);
  });
});

describe("how long ago, by calendar day", () => {
  it("is zero on the day itself, however many hours have passed", () => {
    expect(daysSince("2026-09-03T00:05:00Z", Date.parse("2026-09-03T16:00:00Z"))).toBe(0);
  });

  it("counts a visit late at night as yesterday the moment the date turns", () => {
    // 23:50 Phnom Penh time on the 2nd, read back one minute into the 3rd.
    expect(daysSince("2026-09-02T16:50:00Z", Date.parse("2026-09-02T17:01:00Z"))).toBe(1);
  });

  it("adds up across a stretch of days", () => {
    expect(daysSince("2026-09-01T00:00:00Z", Date.parse("2026-09-08T00:00:00Z"))).toBe(7);
  });
});

describe("weeks and months", () => {
  it("a week is Monday to Sunday", () => {
    // 2026-09-03 is a Thursday.
    expect(weekKey("2026-09-03")).toBe("2026-08-31");
    expect(weekKey("2026-08-31")).toBe("2026-08-31"); // the Monday itself
  });

  it("and Sunday belongs to the week that has just ended", () => {
    // 2026-09-06 is a Sunday; its Monday was the 31st of August.
    expect(weekKey("2026-09-06")).toBe("2026-08-31");
    expect(weekKey("2026-09-07")).toBe("2026-09-07"); // the next Monday
  });

  it("a month is the month", () => {
    expect(monthKey("2026-09-30")).toBe("2026-09");
    expect(monthKey("2026-10-01")).toBe("2026-10");
  });
});

/**
 * The separator, not the names, is what differs between engines: Node's ICU
 * writes "Monday, 7 September 2026" and Chromium's writes it without the
 * comma. A heading built from `Intl.format()` therefore rendered one string on
 * the server and hydrated another in the browser. These assertions pin the
 * form we supply ourselves, which is the same in both.
 */
describe("a day written out", () => {
  it("has no punctuation an engine could disagree about", () => {
    expect(longDay("2026-09-07")).toBe("Monday 7 September 2026");
    expect(longDay("2026-09-07")).not.toContain(",");
  });

  it("drops the year when a heading does not need one", () => {
    expect(longDay("2026-09-07", { year: false })).toBe("Monday 7 September");
  });

  it("names the day it is here, not the day it is in UTC", () => {
    // The 30th of August 2026 is a Sunday in Phnom Penh.
    expect(longDay("2026-08-30")).toBe("Sunday 30 August 2026");
  });

  it("and does not slide across a month end while being formatted", () => {
    expect(longDay("2026-09-01")).toBe("Tuesday 1 September 2026");
    expect(longDay("2026-08-31")).toBe("Monday 31 August 2026");
  });
});

describe("naming a stretch of time", () => {
  it("writes a day short, for a line of them", () => {
    expect(shortDay("2026-08-31")).toBe("31 Aug");
  });

  it("a week by the days at each end", () => {
    expect(weekLabel("2026-08-31")).toBe("31 Aug – 6 Sept");
  });

  it("and a week that crosses a month says both months", () => {
    expect(weekLabel("2026-09-28")).toBe("28 Sept – 4 Oct");
  });

  it("a month by its name and year", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
    expect(monthLabel("2027-01")).toBe("January 2027");
  });
});
