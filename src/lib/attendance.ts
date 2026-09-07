/**
 * What a day of calls adds up to.
 *
 * The database records visits — checked in here at 08:12, out at 08:41. The
 * office asks a different question: how long was somebody working, and how
 * much of that were they actually in front of a customer. Both answers come
 * out of the same list of visits, and neither is a sum of the other.
 *
 *   WORKING HOURS are the day's span: from the first check-in to the last
 *   check-out. It includes the ride between shops, lunch, and the half hour
 *   spent finding somewhere to park, because all of that is the working day.
 *
 *   ACTIVE HOURS are the time inside shops: the visits themselves, added up.
 *   Never more than the working hours, and the gap between the two is the
 *   travelling.
 *
 * Three things this refuses to guess at.
 *
 * A visit that crosses midnight belongs to both days, split at the boundary,
 * because a rep who checks out at 00:20 worked the evening before and the
 * report must not file half an hour under the wrong morning.
 *
 * A visit still open on a day that has ended is somebody who forgot to check
 * out. It contributes nothing and the day is flagged `unclosed`, because
 * pretending they left at midnight would invent hours nobody worked. Open
 * *today* is different: the rep is in the shop now, and the figure runs to now.
 *
 * Overlapping visits cannot happen — the database allows one open visit at a
 * time — but active hours are still a union rather than a sum, so a row
 * inserted by hand cannot make somebody work twenty-six hours in a day.
 *
 * Every function takes `now` rather than reading the clock, so a report renders
 * the same on the server and in the browser, and so the tests can sit at any
 * hour of any day.
 */

import { addDays, dayEndMs, dayKey, dayStartMs, monthKey, weekKey } from "./time";

export type VisitSpan = {
  id?: string;
  userId?: string;
  customerId?: string;
  checkedInAt: string;
  checkedOutAt: string | null;
};

export type AttendanceDay = {
  key: string;
  /** The first check-in of the day, ISO. */
  clockIn: string | null;
  /** The last check-out, ISO. Null while the day is still being worked. */
  clockOut: string | null;
  /** First check-in to last check-out, or to `now` while it is still running. */
  workingMs: number;
  /** The visits themselves, merged so overlaps cannot be counted twice. */
  activeMs: number;
  visits: number;
  /** A visit is open right now. */
  open: boolean;
  /** A visit on a finished day was never closed, so the figures are short. */
  unclosed: boolean;
};

type Range = { from: number; to: number };

/**
 * Overlapping ranges folded into one.
 *
 * Sorted by start, then each range either extends the one before it or begins
 * a new one. Touching ranges — one ending exactly where the next begins — are
 * joined, because a rep walking straight from one shop to the next did not
 * stop working in between.
 */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  const out: Range[] = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range.from <= last.to) {
      if (range.to > last.to) last.to = range.to;
    } else {
      out.push({ ...range });
    }
  }
  return out;
}

const spanMs = (ranges: Range[]) =>
  ranges.reduce((total, r) => total + (r.to - r.from), 0);

/**
 * One person's visits, turned into days.
 *
 * Only days with visits come back, newest first: a report of empty days is a
 * calendar, and `fillDays` makes one when a calendar is what is wanted.
 */
export function attendanceDays(spans: VisitSpan[], nowMs: number): AttendanceDay[] {
  const today = dayKey(nowMs);

  // Everything a day needs, gathered before any of it is measured.
  type Bucket = { ranges: Range[]; visits: number; open: boolean; unclosed: boolean };
  const buckets = new Map<string, Bucket>();
  const bucket = (key: string) => {
    let found = buckets.get(key);
    if (!found) {
      found = { ranges: [], visits: 0, open: false, unclosed: false };
      buckets.set(key, found);
    }
    return found;
  };

  for (const span of spans) {
    const from = Date.parse(span.checkedInAt);
    if (Number.isNaN(from)) continue;

    const startKey = dayKey(from);

    if (span.checkedOutAt === null) {
      const here = bucket(startKey);
      here.visits += 1;
      if (startKey === today) {
        // In a shop right now. The figure runs to this moment.
        here.open = true;
        here.ranges.push({ from, to: Math.max(from, nowMs) });
      } else {
        // Somebody forgot to check out. Guessing when they left would be
        // inventing hours; the flag is the honest answer.
        here.unclosed = true;
      }
      continue;
    }

    const to = Date.parse(span.checkedOutAt);
    if (Number.isNaN(to) || to < from) continue;

    // Split at midnight, so an evening call that ends after twelve counts on
    // the evening it started as well as the morning it finished.
    for (let key = startKey; key <= dayKey(to); key = addDays(key, 1)) {
      const here = bucket(key);
      if (key === startKey) here.visits += 1;
      const slice = {
        from: Math.max(from, dayStartMs(key)),
        to: Math.min(to, dayEndMs(key)),
      };
      if (slice.to > slice.from) here.ranges.push(slice);
      else if (key === startKey) here.ranges.push(slice); // a zero-length call
    }
  }

  const days: AttendanceDay[] = [];
  for (const [key, found] of buckets) {
    const merged = mergeRanges(found.ranges);
    const first = merged[0];
    const last = merged[merged.length - 1];
    days.push({
      key,
      clockIn: first ? new Date(first.from).toISOString() : null,
      clockOut: found.open || !last ? null : new Date(last.to).toISOString(),
      workingMs: first ? last.to - first.from : 0,
      activeMs: spanMs(merged),
      visits: found.visits,
      open: found.open,
      unclosed: found.unclosed,
    });
  }

  return days.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

/** The same days with the blank ones put back, oldest last, for a calendar. */
export function fillDays(
  days: AttendanceDay[],
  fromKey: string,
  toKey: string,
): AttendanceDay[] {
  const have = new Map(days.map((day) => [day.key, day]));
  const out: AttendanceDay[] = [];
  for (let key = fromKey; key <= toKey; key = addDays(key, 1)) {
    out.push(
      have.get(key) ?? {
        key,
        clockIn: null,
        clockOut: null,
        workingMs: 0,
        activeMs: 0,
        visits: 0,
        open: false,
        unclosed: false,
      },
    );
    if (out.length > 3660) break;
  }
  return out.reverse();
}

export type Period = {
  key: string;
  days: AttendanceDay[];
  workingMs: number;
  activeMs: number;
  visits: number;
  /** Days anything happened on. The divisor for an average that means something. */
  daysWorked: number;
  unclosed: boolean;
};

function group(days: AttendanceDay[], keyOf: (key: string) => string): Period[] {
  const periods = new Map<string, Period>();
  for (const day of days) {
    const key = keyOf(day.key);
    let period = periods.get(key);
    if (!period) {
      period = {
        key, days: [], workingMs: 0, activeMs: 0, visits: 0,
        daysWorked: 0, unclosed: false,
      };
      periods.set(key, period);
    }
    period.days.push(day);
    period.workingMs += day.workingMs;
    period.activeMs += day.activeMs;
    period.visits += day.visits;
    // A day counts as worked if anything happened on it — including the
    // twenty minutes after midnight belonging to a call that began yesterday.
    if (day.visits > 0 || day.workingMs > 0) period.daysWorked += 1;
    if (day.unclosed) period.unclosed = true;
  }
  return [...periods.values()].sort((a, b) =>
    a.key < b.key ? 1 : a.key > b.key ? -1 : 0,
  );
}

/** Weeks, Monday to Sunday, keyed by the Monday. */
export const groupByWeek = (days: AttendanceDay[]) => group(days, weekKey);

/** Months, keyed "2026-09". */
export const groupByMonth = (days: AttendanceDay[]) => group(days, monthKey);

/** One person's visits at a time, since attendance is always somebody's. */
export function byPerson(spans: VisitSpan[]): Map<string, VisitSpan[]> {
  const out = new Map<string, VisitSpan[]>();
  for (const span of spans) {
    const key = span.userId ?? "";
    const list = out.get(key);
    if (list) list.push(span);
    else out.set(key, [span]);
  }
  return out;
}

/**
 * A duration as somebody would say it: "7h 45m", "45m", "8h".
 *
 * Rounded to the minute, because attendance is not a stopwatch and a figure
 * with seconds in it invites an argument about seconds.
 */
export function hoursMinutes(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** The same duration as a number, for a total somebody wants to add up. */
export function decimalHours(ms: number): number {
  return Math.round((Math.max(0, ms) / 3_600_000) * 100) / 100;
}

/**
 * How much of the working day was spent in shops, 0 to 1.
 *
 * Null when there was no working day to divide by — which is not zero, and a
 * bar chart drawing it as zero would be saying something untrue.
 */
export function activeShare(day: { workingMs: number; activeMs: number }): number | null {
  if (day.workingMs <= 0) return null;
  return Math.min(1, day.activeMs / day.workingMs);
}
