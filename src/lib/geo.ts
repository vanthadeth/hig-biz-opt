/**
 * Distance on the ground.
 *
 * One haversine, used by everything that measures between two pins: the cart's
 * customer picker sorting shops, the check-in screen showing how far away one
 * is. The distance that gets *recorded* against a visit is never this one — it
 * is `app.metres_between`, computed in the database from the shop's own row at
 * the moment of the check-in, because a client that computes its own distance
 * is a client that can report any distance it likes.
 *
 * The two implementations are held to the same answer to the millimetre in
 * `geo.test.ts`. A screen that disagrees with the record it is about to
 * produce puts the wrong shop at the top of the list.
 */

/** Straight-line metres on a sphere. Cambodia is not big enough for the ellipsoid to matter. */
export function metresBetween(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
      Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}
