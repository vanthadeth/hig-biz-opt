/** The punch kinds, mirroring public.check_in_kind. */
export type CheckInKind = "in" | "out";

/**
 * Single string literals, as in the web app's src/lib/customers.ts — supabase-js
 * infers row types from the literal, and a joined array loses that.
 */
export const CHECK_IN_COLUMNS =
  "id, user_id, kind, occurred_at, latitude, longitude, accuracy_m, location_source, photo_path, note";

export const CHECK_INS_BUCKET = "check-ins";

export type CheckIn = {
  id: string;
  user_id: string;
  kind: CheckInKind;
  occurred_at: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  location_source: string;
  photo_path: string;
  note: string | null;
};

/**
 * Where the team is, and therefore what "today" means.
 *
 * Pinned rather than taken from the device: a phone that has wandered onto
 * another zone would otherwise decide somebody's day started yesterday. The web
 * app pins the same zone in src/lib/audit.ts.
 */
export const TIME_ZONE = "Asia/Phnom_Penh";

const DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day an instant falls on, in Phnom Penh, as "2026-09-04". */
export function dayOf(instant: Date | string): string {
  return DAY.format(typeof instant === "string" ? new Date(instant) : instant);
}

export function isToday(instant: Date | string, now: Date = new Date()): boolean {
  return dayOf(instant) === dayOf(now);
}

/** Today's punches, newest last, out of whatever the query returned. */
export function todays(checkIns: CheckIn[], now: Date = new Date()): CheckIn[] {
  return checkIns
    .filter((c) => isToday(c.occurred_at, now))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

/**
 * Which punch the button offers.
 *
 * The day starts closed, so the first press is always a check-in. After that it
 * alternates from whatever today's last punch was — and yesterday's has no say,
 * so somebody who forgot to check out still starts today by checking in rather
 * than being offered a check-out for a day that has ended.
 */
export function nextKind(checkIns: CheckIn[], now: Date = new Date()): CheckIn["kind"] {
  const today = todays(checkIns, now);
  const last = today[today.length - 1];
  return last?.kind === "in" ? "out" : "in";
}

/** Whether the person is currently on the clock, by the same reading. */
export function isOnTheClock(checkIns: CheckIn[], now: Date = new Date()): boolean {
  return nextKind(checkIns, now) === "out";
}

const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTime(instant: Date | string): string {
  return TIME.format(typeof instant === "string" ? new Date(instant) : instant);
}

export const KIND_LABELS: Record<CheckInKind, string> = {
  in: "Checked in",
  out: "Checked out",
};

export const ACTION_LABELS: Record<CheckInKind, string> = {
  in: "Check in",
  out: "Check out",
};

/**
 * Where a punch's photograph goes.
 *
 * The first path segment is the person, which is what the storage policies key
 * on — so the same scope rule reaches the photograph as reaches the row.
 */
export function photoPath(userId: string, now: Date = new Date()): string {
  return `${userId}/${now.getTime()}.jpg`;
}
