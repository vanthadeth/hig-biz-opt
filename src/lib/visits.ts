/**
 * Visits, as the screens read them.
 *
 * The database decides the numbers — how far the rep was from the shop, which
 * radius that was judged against, whether it counts as out of range — because
 * a client that computes its own distance is a client that can report any
 * distance it likes. What is here is everything downstream of that: the row
 * shapes, the words for a distance, and the one judgement the phone has to
 * make before it asks the database anything, which is whether the fix it just
 * got is good enough to send.
 */

import { dayKey } from "./time";

export type VisitOptionKind =
  | "visit_type"
  | "visit_status"
  | "order_status"
  | "payment_status";

export type VisitOption = {
  id: string;
  kind: VisitOptionKind;
  label: string;
  sort_order: number;
  active: boolean;
};

export const OPTION_COLUMNS = "id, kind, label, sort_order, active";

/** The four dropdowns, in the order the check-in form asks them. */
export const OPTION_KINDS: { kind: VisitOptionKind; label: string }[] = [
  { kind: "visit_type", label: "Type of visit" },
  { kind: "visit_status", label: "Visit status" },
  { kind: "order_status", label: "Order status" },
  { kind: "payment_status", label: "Payment status" },
];

export function optionsOf(options: VisitOption[], kind: VisitOptionKind): VisitOption[] {
  return options
    .filter((option) => option.kind === kind && option.active)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export type VisitRow = {
  id: string;
  user_id: string;
  customer_id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  in_latitude: number | null;
  in_longitude: number | null;
  out_latitude: number | null;
  out_longitude: number | null;
  distance_m: number | null;
  out_of_range: boolean;
  radius_m: number | null;
  visit_type_id: string | null;
  visit_status_id: string | null;
  order_status_id: string | null;
  payment_status_id: string | null;
  next_appointment: string | null;
  remarks: string | null;
  customer: { shop_name: string; latitude: number | null; longitude: number | null } | null;
};

// One literal, not a concatenation: supabase-js reads this string in the type
// system to work out the row shape.
export const VISIT_COLUMNS =
  "id, user_id, customer_id, checked_in_at, checked_out_at, in_latitude, in_longitude, out_latitude, out_longitude, distance_m, out_of_range, radius_m, visit_type_id, visit_status_id, order_status_id, payment_status_id, next_appointment, remarks, customer:customers (shop_name, latitude, longitude)";

/**
 * How far away, in words.
 *
 * Null is "unknown", never "0 m" — the shop has no pin, and a screen that
 * writes zero is claiming the rep was standing on it.
 *
 * Rounded coarsely on purpose. A phone's fix is good to a few metres at best
 * and often much worse; "at the shop" and "180 m away" are the two things
 * anybody acts on, and "183.4 m" is precision the number does not have.
 */
export function distanceLabel(metres: number | null): string {
  if (metres === null || !Number.isFinite(metres)) return "Distance unknown";
  if (metres < 30) return "At the shop";
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m away`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km away`;
}

/**
 * What to say about a check-in that landed outside the radius.
 *
 * It was still recorded — that is the whole design — so this is a note, not an
 * error, and it says what the radius was rather than only that it was missed.
 */
export function rangeNote(visit: Pick<VisitRow, "out_of_range" | "distance_m" | "radius_m">):
  string | null {
  if (visit.distance_m === null) return "The shop has no location saved yet.";
  if (!visit.out_of_range) return null;
  const radius = visit.radius_m === null ? "the allowed distance" : `${visit.radius_m} m`;
  return `Checked in ${distanceLabel(visit.distance_m).replace(" away", "")} from the shop, outside ${radius}.`;
}

/**
 * Whether a fix from the phone is worth sending.
 *
 * A browser will happily hand back a position accurate to five kilometres — an
 * IP-address guess dressed as a location — and sending that would record a
 * check-in the rep never made where the report says they made it. Anything
 * vaguer than this is treated as no fix at all, which the database already
 * handles: distance unknown, position not kept.
 */
export const ACCURACY_LIMIT_M = 500;

export type Fix = { latitude: number; longitude: number; accuracy: number | null };

export function usableFix(fix: Fix | null): Fix | null {
  if (!fix) return null;
  if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return null;
  if (Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180) return null;
  if (fix.accuracy !== null && fix.accuracy > ACCURACY_LIMIT_M) return null;
  return fix;
}

/**
 * Why the phone would not give a position, in words a rep can act on.
 *
 * The browser's own messages are about the API. "User denied Geolocation" is
 * true and useless; "Location is switched off for this site" is something
 * somebody can go and fix.
 */
export function locationProblem(code: number | null): string {
  switch (code) {
    case 1: return "Location is switched off for this site. Turn it on to check in here.";
    case 2: return "Your phone could not get a location. Try again outside.";
    case 3: return "Getting a location took too long. Try again.";
    default: return "Your phone could not get a location.";
  }
}

/** The visit somebody is in the middle of, if there is one. */
export function openVisit<T extends { checked_out_at: string | null }>(
  visits: T[],
): T | null {
  return visits.find((visit) => visit.checked_out_at === null) ?? null;
}

/**
 * How long a visit lasted, or has lasted so far.
 *
 * `now` is a parameter so the same call renders identically on the server and
 * in the browser, and so a list does not flicker as the clock moves under it.
 */
export function visitLength(
  visit: Pick<VisitRow, "checked_in_at" | "checked_out_at">,
  nowMs: number,
): number {
  const from = Date.parse(visit.checked_in_at);
  if (Number.isNaN(from)) return 0;
  const to = visit.checked_out_at === null ? nowMs : Date.parse(visit.checked_out_at);
  if (Number.isNaN(to)) return 0;
  return Math.max(0, to - from);
}

/** Visits gathered under the Cambodian day they began on, newest day first. */
export function visitsByDay<T extends { checked_in_at: string }>(
  visits: T[],
): { key: string; visits: T[] }[] {
  const days = new Map<string, T[]>();
  for (const visit of visits) {
    const key = dayKey(visit.checked_in_at);
    const found = days.get(key);
    if (found) found.push(visit);
    else days.set(key, [visit]);
  }
  return [...days.entries()]
    .map(([key, list]) => ({
      key,
      visits: [...list].sort((a, b) => (a.checked_in_at < b.checked_in_at ? 1 : -1)),
    }))
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

/**
 * Whether a closed visit can still be corrected.
 *
 * The database is what enforces this; the screen asks so it can grey the form
 * out rather than letting somebody type for a minute and then be refused.
 */
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function editable(
  visit: Pick<VisitRow, "checked_out_at">,
  nowMs: number,
): boolean {
  if (visit.checked_out_at === null) return true; // still in the shop
  const closed = Date.parse(visit.checked_out_at);
  if (Number.isNaN(closed)) return false;
  return nowMs - closed < EDIT_WINDOW_MS;
}

/** How long is left to correct it, for a form that says so. */
export function editWindowLeft(
  visit: Pick<VisitRow, "checked_out_at">,
  nowMs: number,
): number | null {
  if (visit.checked_out_at === null) return null;
  const closed = Date.parse(visit.checked_out_at);
  if (Number.isNaN(closed)) return 0;
  return Math.max(0, EDIT_WINDOW_MS - (nowMs - closed));
}
