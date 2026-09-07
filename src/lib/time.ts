/**
 * Cambodian time, pinned rather than taken from the machine.
 *
 * Two reasons. A page renders on a server in UTC and then hydrates in a
 * browser in Phnom Penh, and a timestamp formatted from the local zone would
 * differ between the two. And everyone reading these screens is in one
 * country: "at 14:32" should mean the same thing to all of them.
 *
 * Everything below is about the same question asked two ways — which calendar
 * day an instant fell on, and which instants a calendar day covers. Attendance
 * lives or dies on that: a rep who checks out at half past midnight worked the
 * evening before, and a report that files it under the next morning is wrong
 * about somebody's hours.
 */

export const TIME_ZONE = "Asia/Phnom_Penh";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** What the wall clock reads here, broken up. */
const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** The Cambodian calendar day an instant falls on, as "2026-09-03". */
export function dayKey(at: string | number | Date): string {
  return dayFormat.format(new Date(at));
}

export function timeOf(at: string | number | Date): string {
  return timeFormat.format(new Date(at));
}

/**
 * How far ahead of UTC the zone was at that instant, in milliseconds.
 *
 * Read off the formatter rather than hardcoded. Cambodia has sat at +07:00
 * without daylight saving since 1906, but a constant here would be a trap for
 * whoever adds a second country.
 */
function offsetMs(at: number): number {
  const parts = partsFormat.formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Hour 24 is midnight in some formatters' telling of it.
  const hour = get("hour") % 24;
  const asIfUtc = Date.UTC(
    get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"),
  );
  return asIfUtc - at;
}

/**
 * The instant a Cambodian day begins.
 *
 * Guessed with the offset in force at the naive UTC midnight, then corrected
 * once with the offset in force at the guess. Two passes settle any zone whose
 * offset moves by less than a day, which is all of them.
 */
export function dayStartMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const first = naive - offsetMs(naive);
  return naive - offsetMs(first);
}

/** The instant it ends — exclusive, so it is the next day's start. */
export function dayEndMs(key: string): number {
  return dayStartMs(addDays(key, 1));
}

/** The day `n` days along, "2026-09-30" + 1 being "2026-10-01". */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + n));
  return at.toISOString().slice(0, 10);
}

/** Every day from one to another, inclusive, in order. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let key = from; key <= to; key = addDays(key, 1)) {
    out.push(key);
    if (out.length > 3660) break; // ten years; a runaway loop is not a report
  }
  return out;
}

/** The Monday of the week a day falls in. Weeks start on Monday here. */
export function weekKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(key, dow === 0 ? -6 : 1 - dow);
}

/** The month a day falls in, as "2026-09". */
export function monthKey(key: string): string {
  return key.slice(0, 7);
}

/**
 * A day written out: "Monday 7 September 2026".
 *
 * Assembled from the formatter's parts rather than taken from `format()`,
 * because the separators are not the same everywhere. Node's ICU writes
 * "Monday, 7 September 2026" and Chromium's writes it without the comma — so a
 * heading rendered on the server and hydrated in the browser was two different
 * strings, and React threw the whole tree away and drew it again. The names of
 * the days and months are stable; only the punctuation between them was not,
 * so this supplies the punctuation itself.
 */
const longDayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function longDay(key: string, { year = true }: { year?: boolean } = {}): string {
  // Midday, so the date cannot slide across a boundary while being formatted
  // back into the zone it was derived in.
  const parts = longDayFormat.formatToParts(new Date(`${key}T12:00:00Z`));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const written = `${get("weekday")} ${get("day")} ${get("month")}`;
  return year ? `${written} ${get("year")}` : written;
}
