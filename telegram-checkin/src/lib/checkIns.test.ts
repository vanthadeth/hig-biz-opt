import { describe, expect, it } from "vitest";
import {
  dayOf,
  formatTime,
  isOnTheClock,
  nextKind,
  photoPath,
  todays,
  type CheckIn,
} from "./checkIns";

// Phnom Penh is UTC+7 all year, so 17:00Z is 00:00 the next day there. Every
// instant below is chosen to sit either side of that line on purpose.
const NOW = new Date("2026-09-04T03:00:00Z"); // 10:00, Friday, in Phnom Penh

function punch(kind: CheckIn["kind"], occurredAt: string): CheckIn {
  return {
    id: occurredAt,
    user_id: "u1",
    kind,
    occurred_at: occurredAt,
    latitude: 11.5564,
    longitude: 104.9282,
    accuracy_m: 12,
    location_source: "telegram",
    photo_path: "u1/1.jpg",
    note: null,
  };
}

describe("dayOf", () => {
  it("reads the day in Phnom Penh, not in UTC", () => {
    // 22:30Z on the 3rd is already 05:30 on the 4th where the team is.
    expect(dayOf("2026-09-03T22:30:00Z")).toBe("2026-09-04");
  });

  it("keeps late-evening local time on the same day", () => {
    // 16:00Z is 23:00 local — still the 4th.
    expect(dayOf("2026-09-04T16:00:00Z")).toBe("2026-09-04");
  });

  it("rolls over at local midnight", () => {
    expect(dayOf("2026-09-04T17:00:00Z")).toBe("2026-09-05");
  });
});

describe("nextKind", () => {
  it("offers a check-in when nothing has happened yet", () => {
    expect(nextKind([], NOW)).toBe("in");
  });

  it("offers a check-out once the day has started", () => {
    expect(nextKind([punch("in", "2026-09-04T01:00:00Z")], NOW)).toBe("out");
  });

  it("offers a check-in again after checking out", () => {
    const day = [punch("in", "2026-09-04T01:00:00Z"), punch("out", "2026-09-04T02:00:00Z")];

    expect(nextKind(day, NOW)).toBe("in");
  });

  it("reads the last punch, not the newest row handed to it", () => {
    // The query returns newest first; the answer must not depend on that.
    const unordered = [
      punch("out", "2026-09-04T02:00:00Z"),
      punch("in", "2026-09-04T01:00:00Z"),
    ];

    expect(nextKind(unordered, NOW)).toBe("in");
  });

  it("starts a new day closed even when yesterday was never closed", () => {
    // Somebody who forgot to check out is not offered a check-out this morning
    // for a day that has already ended.
    expect(nextKind([punch("in", "2026-09-03T01:00:00Z")], NOW)).toBe("in");
  });

  it("ignores a punch from later tonight in UTC terms", () => {
    // 17:00Z is tomorrow locally, so it is not part of today's reading.
    const day = [punch("in", "2026-09-04T17:00:00Z")];

    expect(nextKind(day, NOW)).toBe("in");
  });
});

describe("isOnTheClock", () => {
  it("is false before the day starts", () => {
    expect(isOnTheClock([], NOW)).toBe(false);
  });

  it("is true between a check-in and a check-out", () => {
    expect(isOnTheClock([punch("in", "2026-09-04T01:00:00Z")], NOW)).toBe(true);
  });
});

describe("todays", () => {
  it("keeps only today's, oldest first", () => {
    const rows = [
      punch("out", "2026-09-04T02:00:00Z"),
      punch("in", "2026-09-03T01:00:00Z"),
      punch("in", "2026-09-04T01:00:00Z"),
    ];

    expect(todays(rows, NOW).map((c) => c.occurred_at)).toEqual([
      "2026-09-04T01:00:00Z",
      "2026-09-04T02:00:00Z",
    ]);
  });
});

describe("formatTime", () => {
  it("shows the time the person experienced, on a 24-hour clock", () => {
    expect(formatTime("2026-09-04T01:05:00Z")).toBe("08:05");
  });
});

describe("photoPath", () => {
  it("files the object under the person, which is what the policy keys on", () => {
    expect(photoPath("abc-123", new Date(1_757_000_000_000))).toBe("abc-123/1757000000000.jpg");
  });
});
