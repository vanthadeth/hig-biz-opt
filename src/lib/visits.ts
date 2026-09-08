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

import { translate, DEFAULT_LANG, type Lang, type MessageKey } from "./i18n";
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

/** The four questions, in the order the check-in form asks them. */
export const OPTION_KINDS: { kind: VisitOptionKind; labelKey: MessageKey }[] = [
  { kind: "visit_type", labelKey: "visit.type" },
  { kind: "visit_status", labelKey: "visit.status" },
  { kind: "order_status", labelKey: "visit.orderStatus" },
  { kind: "payment_status", labelKey: "visit.paymentStatus" },
];

export function optionsOf(options: VisitOption[], kind: VisitOptionKind): VisitOption[] {
  return options
    .filter((option) => option.kind === kind && option.active)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

/**
 * The shop, as a visit carries it.
 *
 * Two shapes rather than one: a report over a department's quarter embeds only
 * what its map and its list need, and typing every function against the wider
 * shape would make the thin query un-passable to any of them. What each
 * function asks for is the fields it actually reads.
 */
export type VisitShop = {
  shop_name: string;
  latitude: number | null;
  longitude: number | null;
};

/** The same shop with the geography a single day's screens have room to show. */
export type PlacedShop = VisitShop & {
  /** The province code, when the shop was placed against the geography. */
  province_code: string | null;
  /** The province as somebody wrote it, when it was not. */
  province_text: string | null;
};

export type VisitRow = {
  id: string;
  user_id: string;
  /** Null is a visit somewhere that is not a shop, not a missing value. */
  customer_id: string | null;
  checked_in_at: string;
  checked_out_at: string | null;
  in_latitude: number | null;
  in_longitude: number | null;
  out_latitude: number | null;
  out_longitude: number | null;
  distance_m: number | null;
  out_of_range: boolean;
  /** How far from the shop the visit was *closed*. Null is unknown, not zero. */
  checkout_distance_m: number | null;
  checkout_out_of_range: boolean;
  radius_m: number | null;
  visit_type_id: string | null;
  visit_status_id: string | null;
  order_status_id: string | null;
  payment_status_id: string | null;
  next_appointment: string | null;
  remarks: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  customer: PlacedShop | null;
  /**
   * Whose visit this is, by name. Optional so every existing test fixture
   * built before a manager could ever read somebody else's row keeps
   * compiling unchanged — the two screens that actually need a name (the
   * visit detail page, for the "not yours" banner) fetch it explicitly.
   */
  user?: { full_name: string } | null;
};

// One literal, not a concatenation: supabase-js reads this string in the type
// system to work out the row shape.
export const VISIT_COLUMNS =
  "id, user_id, customer_id, checked_in_at, checked_out_at, in_latitude, in_longitude, out_latitude, out_longitude, distance_m, out_of_range, checkout_distance_m, checkout_out_of_range, radius_m, visit_type_id, visit_status_id, order_status_id, payment_status_id, next_appointment, remarks, cancelled_at, cancel_reason, customer:customers (shop_name, latitude, longitude, province_code, province_text)";

/** {@link VISIT_COLUMNS}, plus the visit's own owner -- needed only where a
 * viewer might be looking at somebody else's call, so it stays a separate
 * constant rather than growing the shared one every screen pays for. */
export const VISIT_DETAIL_COLUMNS = `${VISIT_COLUMNS}, user:users (full_name)`;

/**
 * A visit as a report reads it: who, when, and where they stood.
 *
 * Thinner than `VisitRow` on purpose — a report over three months of a
 * department's calls is a lot of rows, and the four dropdown ids and the
 * remarks are not on any of its screens. The coordinates are here because the
 * map draws from the same query.
 */
export type ReportVisit = {
  id: string;
  user_id: string;
  customer_id: string | null;
  checked_in_at: string;
  checked_out_at: string | null;
  in_latitude: number | null;
  in_longitude: number | null;
  distance_m: number | null;
  out_of_range: boolean;
  cancelled_at: string | null;
  user: { full_name: string } | null;
  customer: VisitShop | null;
};

export const REPORT_COLUMNS =
  "id, user_id, customer_id, checked_in_at, checked_out_at, in_latitude, in_longitude, distance_m, out_of_range, cancelled_at, user:users (full_name), customer:customers (shop_name, latitude, longitude)";

/**
 * Who appears in a report, and what to call them.
 *
 * Built from the visits themselves rather than from a list of employees: the
 * policy decides whose visits came back, so the people in the result are
 * exactly the people this person may report on. Asking the users table
 * separately would risk offering a name with nothing behind it.
 */
export function peopleIn(visits: ReportVisit[]): { id: string; name: string }[] {
  const names = new Map<string, string>();
  for (const visit of visits) {
    if (!names.has(visit.user_id)) {
      names.set(visit.user_id, visit.user?.full_name ?? "Removed employee");
    }
  }
  return [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

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
/**
 * The bare distance — "180 m", "1.5 km" — for a sentence that supplies its own
 * words around it. Separate from `distanceLabel` rather than that one with
 * " away" stripped off: the two languages do not put the word in the same
 * place, and a string-replace can only be right in one of them.
 */
export function distanceOnly(metres: number, lang: Lang = DEFAULT_LANG): string {
  if (metres < 1000) return translate(lang, "visit.metres", { n: Math.round(metres / 10) * 10 });
  return translate(lang, "visit.km", {
    n: (metres / 1000).toFixed(metres < 10_000 ? 1 : 0),
  });
}

export function distanceLabel(metres: number | null, lang: Lang = DEFAULT_LANG): string {
  if (metres === null || !Number.isFinite(metres)) return translate(lang, "visit.distanceUnknown");
  if (metres < 30) return translate(lang, "visit.atTheShop");
  if (metres < 1000) return translate(lang, "visit.metresAway", { n: Math.round(metres / 10) * 10 });
  return translate(lang, "visit.kmAway", {
    n: (metres / 1000).toFixed(metres < 10_000 ? 1 : 0),
  });
}

/**
 * What a visit calls the place it was to.
 *
 * Three different things that must not read as one. A shop, by its name. No
 * shop at all, which is a rep at a prospect nobody has written down or a
 * morning at the warehouse, and is a deliberate answer. And a shop whose
 * record has gone, which should not happen — the foreign key refuses to delete
 * a customer with visits — but is worth saying plainly if it ever does.
 */


export function shopNameOf(
  visit: { customer_id: string | null; customer: VisitShop | null },
  lang: Lang = DEFAULT_LANG,
): string {
  if (visit.customer_id === null) return translate(lang, "visit.somewhereElse");
  return visit.customer?.shop_name ?? translate(lang, "visit.shopRemoved");
}

/** Whether a shop can still be filled in: never had one, and still correctable. */
export function canNameShop(
  visit: Pick<VisitRow, "customer_id" | "checked_out_at" | "cancelled_at">,
  nowMs: number,
): boolean {
  if (visit.cancelled_at !== null) return false;
  return visit.customer_id === null && editable(visit, nowMs);
}

/**
 * What to say about the distance, when there is something to say.
 *
 * Null distance has four different causes and they need four different
 * sentences, because three of them are somebody's to fix and the fourth is
 * nobody's. Saying "unknown" to all of them tells a rep nothing about whether
 * to turn location on, pin the shop, or leave it alone.
 *
 * A check-in inside the radius says nothing at all. Silence is the good case,
 * and a note on every visit is a note nobody reads.
 */
export function rangeNote(
  visit: {
    out_of_range: boolean;
    distance_m: number | null;
    radius_m: number | null;
    customer_id: string | null;
    in_latitude: number | null;
    customer: VisitShop | null;
  },
  lang: Lang = DEFAULT_LANG,
): string | null {
  if (visit.customer_id === null) return translate(lang, "visit.noteNoShop");
  if (visit.distance_m === null) {
    if (visit.in_latitude === null) return translate(lang, "visit.noteNoFix");
    if (visit.customer?.latitude == null) return translate(lang, "visit.noteNoPin");
    // The shop was attached after the fact. It was not there to be measured
    // against at the time, and computing it now from today's coordinates
    // would be inventing evidence.
    return translate(lang, "visit.noteNamedLater");
  }
  if (!visit.out_of_range) return null;
  return visit.radius_m === null
    ? translate(lang, "visit.noteOutsideUnknown", {
        distance: distanceOnly(visit.distance_m, lang),
      })
    : translate(lang, "visit.noteOutside", {
        distance: distanceOnly(visit.distance_m, lang),
        radius: visit.radius_m,
      });
}

/**
 * What to say about where the visit was *closed*.
 *
 * Silent unless there is something to say, on the same terms as the check-in
 * note: a check-out inside the radius is the good case, and a line on every
 * visit is a line nobody reads. Null distance says nothing here at all —
 * whatever caused it has already been explained once by `rangeNote`, and
 * saying it twice makes the screen look like it found two problems.
 */
export function checkoutNote(
  visit: Pick<VisitRow, "checkout_out_of_range" | "checkout_distance_m" | "radius_m">,
  lang: Lang = DEFAULT_LANG,
): string | null {
  if (!visit.checkout_out_of_range || visit.checkout_distance_m === null) return null;
  return visit.radius_m === null
    ? translate(lang, "visit.noteLeftOutsideUnknown", {
        distance: distanceOnly(visit.checkout_distance_m, lang),
      })
    : translate(lang, "visit.noteLeftOutside", {
        distance: distanceOnly(visit.checkout_distance_m, lang),
        radius: visit.radius_m,
      });
}

/**
 * The one word a list has room for about a visit's distance.
 *
 * A timeline row is a line of text on a phone, so the two ends collapse into
 * a single flag — and they collapse towards the bad news, because a visit
 * checked in at the door and closed from the next district is the pattern this
 * whole measurement exists to surface. "Unknown" stays its own answer rather
 * than being folded into either, since a shop with no pin is nobody having
 * done anything wrong.
 */
export type RangeFlag = "none" | "away" | "unknown";

export function rangeFlag(
  visit: Pick<
    VisitRow,
    "customer_id" | "out_of_range" | "checkout_out_of_range" | "distance_m" | "checkout_distance_m"
  >,
): RangeFlag {
  // Not to a shop at all: there was never a distance to measure, so there is
  // nothing to flag and nothing unknown about it.
  if (visit.customer_id === null) return "none";
  if (visit.out_of_range || visit.checkout_out_of_range) return "away";
  if (visit.distance_m === null && visit.checkout_distance_m === null) return "unknown";
  return "none";
}

/**
 * Which province the shop is in, for a list that has room for one word of
 * context after the name.
 *
 * Two shops called "Sok Heng" three provinces apart are two shops, and a
 * timeline that shows only the name makes them look like one. The code is
 * preferred over the written text because it resolves to the same spelling
 * everywhere, and the written text is the fallback for a shop somebody typed
 * in before the geography was synced.
 */
export function provinceOf(
  visit: { customer: PlacedShop | null },
  provinces: Map<string, string>,
): string | null {
  const customer = visit.customer;
  if (!customer) return null;
  const named = customer.province_code === null ? null : provinces.get(customer.province_code);
  if (named) return named;
  const written = customer.province_text?.trim();
  return written ? written : null;
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

/**
 * The visit somebody is in the middle of, if there is one.
 *
 * A cancelled visit is not one, whatever its check-out column says — that is
 * the point of cancelling a check-in that should not have happened, and the
 * database's own index agrees.
 */
export function openVisit<T extends { checked_out_at: string | null; cancelled_at: string | null }>(
  visits: T[],
): T | null {
  return visits.find(
    (visit) => visit.checked_out_at === null && visit.cancelled_at === null,
  ) ?? null;
}

// Calling a visit off ----------------------------------------------------------------

/**
 * A cancellation is an annotation, not an erasure.
 *
 * The row stays, with both its timestamps and its position; it stops counting.
 * The reason is required because "cancelled" with nothing beside it cannot be
 * told apart from a second mistake, and the person reading this next has to be
 * able to tell the difference.
 */
export const CANCEL_REASON_MIN = 3;

export function cancelProblem(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed === "") return "Say why this visit is being cancelled.";
  if (trimmed.length < CANCEL_REASON_MIN) return "A few more words than that.";
  return null;
}

export function cancelChange(reason: string) {
  return { cancelled_at: new Date().toISOString(), cancel_reason: reason.trim() };
}

/**
 * And taking that back.
 *
 * Cancelling is itself a tap somebody can get wrong — the wrong row in a list,
 * a reason typed about a different visit — and a mistake with no way back is
 * how a rep loses an afternoon's hours for good. Both columns clear together
 * because the database refuses half a state, and refusing it here too means
 * the screen never sends a write that cannot land.
 *
 * What comes back is the visit exactly as it was: the timestamps, the
 * position and the distances were never touched by the cancelling, which is
 * the whole point of it being an annotation rather than a delete.
 */
export function uncancelChange() {
  return { cancelled_at: null, cancel_reason: null };
}

/**
 * Whether a cancellation can still be taken back.
 *
 * The same day-long window as every other correction, measured from the
 * check-out — not from the cancelling. A visit that closed two days ago is
 * settled, and cancelling it yesterday does not reopen it for editing.
 */
export function uncancellable(
  visit: Pick<VisitRow, "cancelled_at" | "checked_out_at">,
  nowMs: number,
): boolean {
  return visit.cancelled_at !== null && editable(visit, nowMs);
}

/** Whether a visit can still be called off: same day-long window as any correction. */
export function cancellable(
  visit: Pick<VisitRow, "cancelled_at" | "checked_out_at">,
  nowMs: number,
): boolean {
  return visit.cancelled_at === null && editable(visit, nowMs);
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
 * Where a day of listed visits starts and stops.
 *
 * The timeline is bracketed by a clocking-in and a clocking-out rather than
 * just beginning with the earliest card, because that is how the day is
 * actually lived: you arrive, you make calls, you finish. The two ends are the
 * first check-in and the last check-out of the visits on screen.
 *
 * Deliberately simpler than `attendanceDays`, which splits a visit at midnight
 * and is the authority on hours. This is about the list in front of somebody:
 * the visits shown are the visits bracketed, so the times at the two ends
 * always belong to rows they can see.
 *
 * `open` is a day still being worked — a visit with no check-out — and it
 * comes back with a null clock-out rather than a guessed one, because
 * pretending somebody left is how a day acquires hours nobody worked.
 */
export function dayEnds<
  T extends { checked_in_at: string; checked_out_at: string | null; cancelled_at: string | null },
>(visits: T[]): { clockIn: string | null; clockOut: string | null; open: boolean } {
  let clockIn: string | null = null;
  let clockOut: string | null = null;
  let open = false;

  for (const visit of visits) {
    if (visit.cancelled_at !== null) continue; // called off: it happened to nobody
    if (clockIn === null || visit.checked_in_at < clockIn) clockIn = visit.checked_in_at;
    if (visit.checked_out_at === null) open = true;
    else if (clockOut === null || visit.checked_out_at > clockOut) clockOut = visit.checked_out_at;
  }

  return { clockIn, clockOut: open ? null : clockOut, open };
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
