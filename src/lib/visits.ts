/**
 * The visit: what a rep did in a shop, and what may still be said about it.
 *
 * Isomorphic on purpose — no server imports — because the record form, the bar
 * and the report are all client components, and the same rules have to hold on
 * both sides of the wire.
 */

import type { ChipTone } from "@/components/ui/Chip";

// What the row is ------------------------------------------------------------------

export type VisitType =
  | "sales_call"
  | "collection"
  | "delivery"
  | "merchandising"
  | "follow_up"
  | "prospecting";

export type VisitStatus =
  | "completed"
  | "shop_closed"
  | "owner_away"
  | "rescheduled"
  | "cancelled";

export type VisitOrderStatus = "ordered" | "no_order" | "considering";

export type VisitPaymentStatus =
  | "paid_in_full"
  | "partial_payment"
  | "no_payment"
  | "nothing_due";

/** One row of public.visit_log — the visit with its shop's name already on it. */
export type Visit = {
  id: string;
  customer_id: string;
  user_id: string;
  shop_name: string;
  street_address: string | null;
  district_text: string | null;
  province_text: string | null;
  customer_latitude: number | null;
  customer_longitude: number | null;
  rep_name: string | null;
  checked_in_at: string;
  checked_in_latitude: number | null;
  checked_in_longitude: number | null;
  checked_out_at: string | null;
  checked_out_latitude: number | null;
  checked_out_longitude: number | null;
  visit_type: VisitType | null;
  status: VisitStatus | null;
  order_status: VisitOrderStatus | null;
  payment_status: VisitPaymentStatus | null;
  next_appointment_date: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
};

export const VISIT_COLUMNS =
  "id, customer_id, user_id, shop_name, street_address, district_text, province_text, " +
  "customer_latitude, customer_longitude, rep_name, " +
  "checked_in_at, checked_in_latitude, checked_in_longitude, " +
  "checked_out_at, checked_out_latitude, checked_out_longitude, " +
  "visit_type, status, order_status, payment_status, " +
  "next_appointment_date, remarks, created_at, updated_at";

/** The five things a rep answers. Everything else about a visit is stamped. */
export type VisitRecord = {
  visit_type: VisitType | null;
  status: VisitStatus | null;
  order_status: VisitOrderStatus | null;
  payment_status: VisitPaymentStatus | null;
  next_appointment_date: string | null;
  remarks: string | null;
};

// The words on the buttons ----------------------------------------------------------
// Ordered as they are asked, not alphabetically: the first option in each list is
// the one a normal call answers, so the common visit is the shortest path through
// the form.

export const VISIT_TYPES: { value: VisitType; label: string }[] = [
  { value: "sales_call", label: "Sales call" },
  { value: "collection", label: "Collection" },
  { value: "delivery", label: "Delivery" },
  { value: "merchandising", label: "Merchandising" },
  { value: "follow_up", label: "Follow-up" },
  { value: "prospecting", label: "Prospecting" },
];

export const VISIT_STATUSES: { value: VisitStatus; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "shop_closed", label: "Shop closed" },
  { value: "owner_away", label: "Owner away" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "cancelled", label: "Cancelled" },
];

export const ORDER_STATUSES: { value: VisitOrderStatus; label: string }[] = [
  { value: "ordered", label: "Ordered" },
  { value: "no_order", label: "No order" },
  { value: "considering", label: "Considering" },
];

export const PAYMENT_STATUSES: { value: VisitPaymentStatus; label: string }[] = [
  { value: "paid_in_full", label: "Paid in full" },
  { value: "partial_payment", label: "Partial payment" },
  { value: "no_payment", label: "No payment" },
  { value: "nothing_due", label: "Nothing due" },
];

function labelsOf<T extends string>(
  options: { value: T; label: string }[],
): Record<T, string> {
  return Object.fromEntries(options.map((o) => [o.value, o.label])) as Record<T, string>;
}

export const VISIT_TYPE_LABELS = labelsOf(VISIT_TYPES);
export const VISIT_STATUS_LABELS = labelsOf(VISIT_STATUSES);
export const ORDER_STATUS_LABELS = labelsOf(ORDER_STATUSES);
export const PAYMENT_STATUS_LABELS = labelsOf(PAYMENT_STATUSES);

/**
 * Colour says how the visit went, not what kind it was.
 *
 * A visit type is a category — six neutral chips read as six categories. The
 * three outcome fields carry a judgement, so they are tinted: a rep glancing
 * down the report should see the bad afternoons without reading the words.
 */
export const VISIT_STATUS_TONE: Record<VisitStatus, ChipTone> = {
  completed: "accent",
  shop_closed: "warn",
  owner_away: "warn",
  rescheduled: "warn",
  cancelled: "danger",
};

export const ORDER_STATUS_TONE: Record<VisitOrderStatus, ChipTone> = {
  ordered: "accent",
  no_order: "neutral",
  considering: "brand",
};

export const PAYMENT_STATUS_TONE: Record<VisitPaymentStatus, ChipTone> = {
  paid_in_full: "accent",
  partial_payment: "brand",
  no_payment: "warn",
  // Nothing owed is not an achievement and not a problem. It is the absence of
  // the question, and reads as one.
  nothing_due: "neutral",
};

// Open, closed, and editable ---------------------------------------------------------

/** A visit nobody has checked out of yet. */
export function isOpen(visit: Pick<Visit, "checked_out_at">): boolean {
  return visit.checked_out_at === null;
}

/**
 * The one still open, if there is one.
 *
 * There can only be one — `visits_one_open_per_person` in 0047 is what says so —
 * and that index is exactly why the centre button in the bar never has to ask
 * which visit "Check out" means.
 */
export function openVisit<T extends Pick<Visit, "checked_out_at">>(
  visits: T[],
): T | null {
  return visits.find(isOpen) ?? null;
}

/** How long the rep was in the shop, in minutes, or null while they still are. */
export function visitMinutes(
  visit: Pick<Visit, "checked_in_at" | "checked_out_at">,
): number | null {
  if (!visit.checked_out_at) return null;
  const ms =
    new Date(visit.checked_out_at).getTime() - new Date(visit.checked_in_at).getTime();
  return Math.max(0, Math.round(ms / 60_000));
}

/** "45 min", "1 h 20 min", "just now" — how a person would say it. */
export function durationLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * A rep may correct their own record for a day after they closed it.
 *
 * The database is where this rule actually lives — `public.guard_visit_edit()`
 * in 0047 refuses the update, and refuses it over the REST endpoint too, not
 * only through this form. What is here decides whether a button is drawn. The
 * two have to say the same thing, so if you change one, change the other.
 */
export const VISIT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** When the window shuts, or null for a visit still open (it has not started). */
export function editableUntil(visit: Pick<Visit, "checked_out_at">): Date | null {
  if (!visit.checked_out_at) return null;
  return new Date(new Date(visit.checked_out_at).getTime() + VISIT_EDIT_WINDOW_MS);
}

/**
 * May this person still change what the visit says?
 *
 * An open visit is still being made, so yes. A closed one, for 24 hours. After
 * that only somebody holding `visit.edit` at 'any' scope — a correction to
 * week-old history is a different act from fixing this afternoon's, and it
 * belongs to somebody who was given that reach on purpose.
 */
export function canEditVisit(
  visit: Pick<Visit, "checked_out_at">,
  now: Date,
  options: { anyScope?: boolean } = {},
): boolean {
  if (options.anyScope) return true;
  const until = editableUntil(visit);
  if (!until) return true;
  return now.getTime() <= until.getTime();
}

// The report ---------------------------------------------------------------------

export type Period = "today" | "week" | "month";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

/**
 * The half-open span a period covers, in local time.
 *
 * Local rather than UTC because "today" means the rep's today: a visit at 8am
 * in Phnom Penh belongs to that morning, not to the previous UTC day. The week
 * starts on Monday, which is when a sales week starts here.
 *
 * Half-open — `from` included, `to` excluded — so a visit at exactly midnight
 * lands in one period rather than two.
 */
export function periodRange(period: Period, now: Date): { from: Date; to: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "today") {
    const to = new Date(start);
    to.setDate(to.getDate() + 1);
    return { from: start, to };
  }

  if (period === "week") {
    // getDay() is 0 for Sunday, so Sunday is six days into its week, not none.
    const back = (start.getDay() + 6) % 7;
    const from = new Date(start);
    from.setDate(from.getDate() - back);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }

  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from, to };
}

export function inPeriod(
  visit: Pick<Visit, "checked_in_at">,
  range: { from: Date; to: Date },
): boolean {
  const at = new Date(visit.checked_in_at).getTime();
  return at >= range.from.getTime() && at < range.to.getTime();
}

export type VisitSummary = {
  visits: number;
  completed: number;
  ordered: number;
  collected: number;
};

/**
 * The four numbers the report leads with.
 *
 * `collected` counts money that actually moved, so a partial payment counts and
 * "nothing due" does not — a shop that owed nothing is not a collection, and
 * counting it would make a quiet week look like a good one.
 */
export function summarise(visits: Visit[]): VisitSummary {
  return {
    visits: visits.length,
    completed: visits.filter((v) => v.status === "completed").length,
    ordered: visits.filter((v) => v.order_status === "ordered").length,
    collected: visits.filter(
      (v) => v.payment_status === "paid_in_full" || v.payment_status === "partial_payment",
    ).length,
  };
}
