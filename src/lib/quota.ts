/**
 * What a day, and a week, is supposed to look like.
 *
 * Until now the attendance figures were reported with nothing to read them
 * against: "6h 50m working, 4 visits" is a pair of numbers, not an answer to
 * "am I where I should be by now". A quota supplies the other half — how many
 * shops, how long a day, and how much of that day inside a shop — and the
 * screens draw progress against it.
 *
 * Three rules hold this together, and all three are about not lying to a rep.
 *
 * A target that is null is not zero. Null means nobody manages this figure,
 * and the honest response is to draw no bar at all rather than a full one or
 * an empty one. A business that cares about visit counts and not about hours
 * should not have to invent an hours target to say so.
 *
 * A bar stops at a hundred per cent; the numbers beside it do not. Somebody
 * who made nine of eight calls has done nine, and a bar that silently clips
 * the ninth is hiding the best thing that happened today. The bar is the
 * shape, the figures are the record.
 *
 * Weekly is stored, never derived. Five times the daily target is a guess
 * about a six-day week, and a company that works Saturday mornings would have
 * to fight the arithmetic instead of typing a number.
 */

import type { AttendanceDay, Period } from "./attendance";

export type Quota = {
  daily_visit_target: number | null;
  daily_working_hours: number | null;
  daily_active_hours: number | null;
  weekly_visit_target: number | null;
  weekly_working_hours: number | null;
  weekly_active_hours: number | null;
};

// One literal, not a concatenation: supabase-js reads this string in the type
// system to work out the row shape.
export const QUOTA_COLUMNS =
  "daily_visit_target, daily_working_hours, daily_active_hours, weekly_visit_target, weekly_working_hours, weekly_active_hours";

/** A business that has decided nothing yet, which is where every one starts. */
export const NO_QUOTA: Quota = {
  daily_visit_target: null,
  daily_working_hours: null,
  daily_active_hours: null,
  weekly_visit_target: null,
  weekly_working_hours: null,
  weekly_active_hours: null,
};

export type Measure = "visits" | "working" | "active";
export type Scope = "daily" | "weekly";

/**
 * One bar's worth of truth.
 *
 * `done` and `target` are in the measure's own unit — a count for visits,
 * milliseconds for the two hour figures — so the screen formats them with the
 * same `hoursMinutes` everything else uses and nothing is rounded twice.
 */
export type Bar = {
  measure: Measure;
  done: number;
  target: number;
  /** Clamped to a hundred, because a bar cannot be more than full. */
  percent: number;
  met: boolean;
};

const HOUR_MS = 3_600_000;

/** Hours as somebody types them into the settings screen, as milliseconds. */
export function hoursMs(hours: number | null): number | null {
  if (hours === null || !Number.isFinite(hours)) return null;
  return Math.round(hours * HOUR_MS);
}

export function targetFor(quota: Quota, scope: Scope, measure: Measure): number | null {
  if (scope === "daily") {
    if (measure === "visits") return quota.daily_visit_target;
    if (measure === "working") return hoursMs(quota.daily_working_hours);
    return hoursMs(quota.daily_active_hours);
  }
  if (measure === "visits") return quota.weekly_visit_target;
  if (measure === "working") return hoursMs(quota.weekly_working_hours);
  return hoursMs(quota.weekly_active_hours);
}

/** Whether anything at all is managed at this scope — what decides if a snapshot appears. */
export function anyTarget(quota: Quota, scope: Scope): boolean {
  return (["visits", "working", "active"] as const).some(
    (measure) => targetFor(quota, scope, measure) !== null,
  );
}

type Totals = { visits: number; workingMs: number; activeMs: number };

const doneFor = (totals: Totals, measure: Measure): number =>
  measure === "visits" ? totals.visits : measure === "working" ? totals.workingMs : totals.activeMs;

/**
 * The bars to draw, in the order they are read.
 *
 * Visits first because it is the figure the business manages by, then the
 * length of the day, then how much of it was spent in front of a customer.
 * Measures with no target are absent rather than present and empty.
 *
 * A day nobody has started is not a missing day: `null` totals draw every
 * managed bar at nothing, which is the true state of eight o'clock in the
 * morning.
 */
export function barsFor(
  totals: Totals | null,
  quota: Quota,
  scope: Scope,
): Bar[] {
  const have = totals ?? { visits: 0, workingMs: 0, activeMs: 0 };
  const bars: Bar[] = [];

  for (const measure of ["visits", "working", "active"] as const) {
    const target = targetFor(quota, scope, measure);
    if (target === null || target <= 0) continue;
    const done = doneFor(have, measure);
    bars.push({
      measure,
      done,
      target,
      percent: Math.max(0, Math.min(100, (done / target) * 100)),
      met: done >= target,
    });
  }

  return bars;
}

/** A day's own totals, in the shape `barsFor` reads. */
export function totalsOfDay(day: AttendanceDay | null): Totals | null {
  if (!day) return null;
  return { visits: day.visits, workingMs: day.workingMs, activeMs: day.activeMs };
}

/** A week's, from the period the attendance grouping already builds. */
export function totalsOfPeriod(period: Period | null): Totals | null {
  if (!period) return null;
  return { visits: period.visits, workingMs: period.workingMs, activeMs: period.activeMs };
}

// Setting one ------------------------------------------------------------------------

/** What the settings screen may type into each box, matching the table's own checks. */
export const QUOTA_LIMITS: Record<keyof Quota, { min: number; max: number }> = {
  daily_visit_target: { min: 1, max: 100 },
  daily_working_hours: { min: 0.5, max: 24 },
  daily_active_hours: { min: 0.5, max: 24 },
  weekly_visit_target: { min: 1, max: 700 },
  weekly_working_hours: { min: 0.5, max: 168 },
  weekly_active_hours: { min: 0.5, max: 168 },
};

/**
 * Why a quota would be refused, before the database refuses it.
 *
 * The database is what enforces these; this exists so somebody typing "9"
 * active hours into an eight-hour day is told which two numbers disagree
 * rather than being handed a constraint name.
 */
export function quotaProblem(quota: Quota): string | null {
  for (const [field, limit] of Object.entries(QUOTA_LIMITS) as [
    keyof Quota,
    { min: number; max: number },
  ][]) {
    const value = quota[field];
    if (value === null) continue;
    if (!Number.isFinite(value)) return "That is not a number.";
    if (value < limit.min || value > limit.max) {
      return `Keep ${LABELS[field]} between ${limit.min} and ${limit.max}.`;
    }
  }

  // Active time is time inside shops and the working day contains it, so one
  // can never exceed the other.
  if (
    quota.daily_active_hours !== null &&
    quota.daily_working_hours !== null &&
    quota.daily_active_hours > quota.daily_working_hours
  ) {
    return "Active hours cannot be more than working hours in a day.";
  }
  if (
    quota.weekly_active_hours !== null &&
    quota.weekly_working_hours !== null &&
    quota.weekly_active_hours > quota.weekly_working_hours
  ) {
    return "Active hours cannot be more than working hours in a week.";
  }

  return null;
}

const LABELS: Record<keyof Quota, string> = {
  daily_visit_target: "visits a day",
  daily_working_hours: "working hours a day",
  daily_active_hours: "active hours a day",
  weekly_visit_target: "visits a week",
  weekly_working_hours: "working hours a week",
  weekly_active_hours: "active hours a week",
};

/**
 * A typed box as a number, or null.
 *
 * An empty box is "not managed", which is a real answer and the one every
 * business starts on — so it must not collapse to zero, which the table
 * refuses anyway.
 */
export function numberOrNull(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}
