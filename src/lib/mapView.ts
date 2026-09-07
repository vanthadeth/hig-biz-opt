/**
 * A day's calls, arranged for a map.
 *
 * Two different things get drawn and they must not be confused. Where the rep
 * *was* is evidence — the position their phone reported at the check-in. Where
 * the shop *is* is a record somebody typed, and it may be wrong or missing.
 * When the two differ the map draws both and the line between them, because
 * that gap is the whole question the office is asking.
 *
 * Everything here is arithmetic on numbers. The map library never sees this
 * file, so the placement of every pin is testable without a browser.
 */

import { metresBetween } from "./geo";
import { dayKey } from "./time";
import { shopNameOf, type ReportVisit } from "./visits";

export type MapPin = {
  visitId: string;
  /** Where the rep stood; null when the phone gave no fix. */
  at: { latitude: number; longitude: number } | null;
  /** Where the shop is recorded; null when nobody has pinned it. */
  shop: { latitude: number; longitude: number } | null;
  shopName: string;
  /** 1, 2, 3 — the order of the day, so a route reads off the map. */
  order: number;
  checkedInAt: string;
  outOfRange: boolean;
  distanceM: number | null;
};

export type Bounds = { south: number; west: number; north: number; east: number };

/**
 * One day's visits as pins, in the order they happened.
 *
 * Ordered by check-in time ascending — the reverse of every list in this app,
 * because a route is read from where somebody started, not from where they
 * finished.
 */
export function pinsFor(visits: ReportVisit[], day: string): MapPin[] {
  return visits
    // A visit called off is not a place somebody was working; drawing it would
    // put a pin on the map for a pocket tap.
    .filter((visit) => visit.cancelled_at === null)
    .filter((visit) => dayKey(visit.checked_in_at) === day)
    .sort((a, b) => (a.checked_in_at < b.checked_in_at ? -1 : 1))
    .map((visit, index) => ({
      visitId: visit.id,
      at:
        visit.in_latitude !== null && visit.in_longitude !== null
          ? { latitude: visit.in_latitude, longitude: visit.in_longitude }
          : null,
      shop:
        visit.customer?.latitude != null && visit.customer?.longitude != null
          ? { latitude: visit.customer.latitude, longitude: visit.customer.longitude }
          : null,
      shopName: shopNameOf(visit),
      order: index + 1,
      checkedInAt: visit.checked_in_at,
      outOfRange: visit.out_of_range,
      distanceM: visit.distance_m,
    }));
}

/** The days that have anything to show, newest first. */
export function mappableDays(visits: ReportVisit[]): string[] {
  const days = new Set<string>();
  for (const visit of visits) {
    if (visit.cancelled_at !== null) continue;
    if (visit.in_latitude !== null || visit.customer?.latitude != null) {
      days.add(dayKey(visit.checked_in_at));
    }
  }
  return [...days].sort().reverse();
}

/** Every point a pin puts on the map: where somebody was, and where the shop is. */
export function pointsOf(pins: MapPin[]): { latitude: number; longitude: number }[] {
  return pins.flatMap((pin) =>
    [pin.at, pin.shop].filter((p): p is { latitude: number; longitude: number } => p !== null),
  );
}

/**
 * A box containing every point, or null when there are none.
 *
 * Null rather than a default centre. A map opened on the middle of Cambodia
 * because there was nothing to show is a map that looks like it is showing
 * something.
 */
export function boundsOf(pins: MapPin[]): Bounds | null {
  const points = pointsOf(pins);
  if (points.length === 0) return null;

  return points.reduce<Bounds>(
    (box, point) => ({
      south: Math.min(box.south, point.latitude),
      west: Math.min(box.west, point.longitude),
      north: Math.max(box.north, point.latitude),
      east: Math.max(box.east, point.longitude),
    }),
    {
      south: points[0].latitude, west: points[0].longitude,
      north: points[0].latitude, east: points[0].longitude,
    },
  );
}

/**
 * A box with a little air around it, so a pin is never against the edge.
 *
 * A single point has no extent at all, and a map fitted to it would zoom to the
 * maximum. The pad has a floor for exactly that: about two hundred metres of
 * latitude, which is a street rather than a rooftop.
 */
export function padded(bounds: Bounds, share = 0.15): Bounds {
  const FLOOR = 0.002; // ≈ 220 m
  const padLat = Math.max((bounds.north - bounds.south) * share, FLOOR);
  const padLng = Math.max((bounds.east - bounds.west) * share, FLOOR);
  return {
    south: bounds.south - padLat,
    west: bounds.west - padLng,
    north: bounds.north + padLat,
    east: bounds.east + padLng,
  };
}

/**
 * The line from where somebody stood to the shop they said they were at.
 *
 * Only drawn when both ends are known and they are far enough apart to be
 * worth looking at. Below that the two markers overlap and the line is a
 * smudge under them.
 */
export const GAP_FLOOR_M = 25;

export function gapLine(pin: MapPin): [number, number][] | null {
  if (!pin.at || !pin.shop) return null;
  const metres = metresBetween(
    pin.at.latitude, pin.at.longitude, pin.shop.latitude, pin.shop.longitude,
  );
  if (metres < GAP_FLOOR_M) return null;
  return [
    [pin.at.latitude, pin.at.longitude],
    [pin.shop.latitude, pin.shop.longitude],
  ];
}

/**
 * The route through the day: where the rep actually went, in order.
 *
 * Built from the check-in positions, not the shops, because it is a record of
 * movement rather than of intent. A visit with no fix breaks the line rather
 * than being bridged over — drawing straight through it would claim a journey
 * nobody can evidence.
 */
export function routeLines(pins: MapPin[]): [number, number][][] {
  const lines: [number, number][][] = [];
  let run: [number, number][] = [];

  for (const pin of pins) {
    if (pin.at) {
      run.push([pin.at.latitude, pin.at.longitude]);
    } else {
      if (run.length > 1) lines.push(run);
      run = [];
    }
  }
  if (run.length > 1) lines.push(run);
  return lines;
}
