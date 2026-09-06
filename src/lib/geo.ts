/**
 * Where a shop is, and which one you are standing in.
 *
 * These began in `catalog.ts`, because the cart's customer picker was the first
 * screen that needed them. They are not about carts: a shop's coordinates are a
 * fact about the shop, and My Visit's check-in list asks the same question the
 * picker does — *which of these am I inside?* Leaving them where they started
 * would have had the visit app importing the cart to find out.
 *
 * No server imports, on purpose: both callers are client components.
 */

/** A customer, as any screen that has to place one on the ground sees it. */
export type NearbyCustomer = {
  id: string;
  shop_name: string;
  street_address: string | null;
  province_text: string | null;
  district_text: string | null;
  latitude: number | null;
  longitude: number | null;
};

export const NEARBY_CUSTOMER_COLUMNS =
  "id, shop_name, street_address, province_text, district_text, latitude, longitude";

/**
 * The customers to offer, nearest first when the phone knows where it is.
 *
 * A rep opens this standing in the shop they are dealing with, so the shop they
 * want is almost always the one they are inside. Without a fix — no permission,
 * no signal, a customer whose coordinates were never recorded — this falls back
 * to alphabetical, which is at least predictable.
 *
 * Straight-line distance on a sphere. Cambodia is not large enough for the
 * ellipsoid to matter, and this is choosing between shops in a district, not
 * navigating between them.
 */
export function nearestCustomers<T extends NearbyCustomer>(
  customers: T[],
  from: { latitude: number; longitude: number } | null,
): T[] {
  const byName = [...customers].sort((a, b) => a.shop_name.localeCompare(b.shop_name));
  if (!from) return byName;

  return byName
    .map((customer) => ({ customer, metres: distanceMetres(from, customer) }))
    .sort((a, b) => {
      // A shop with no coordinates is not far away, it is unknown. Unknown
      // sorts after everything known rather than to the top or the bottom of
      // a distance it does not have.
      if (a.metres === null && b.metres === null) return 0;
      if (a.metres === null) return 1;
      if (b.metres === null) return -1;
      return a.metres - b.metres;
    })
    .map((entry) => entry.customer);
}

/** Metres between a point and a customer, or null if the customer has no fix. */
export function distanceMetres(
  from: { latitude: number; longitude: number },
  to: { latitude: number | null; longitude: number | null },
): number | null {
  if (to.latitude === null || to.longitude === null) return null;

  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** "120 m" or "4.3 km" — near enough for choosing between shops. */
export function distanceLabel(metres: number | null): string | null {
  if (metres === null) return null;
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/** The shop's address in one line, for telling two branches apart. */
export function customerWhere(customer: {
  street_address: string | null;
  district_text: string | null;
  province_text: string | null;
}): string | null {
  const parts = [customer.street_address, customer.district_text, customer.province_text]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);
  return parts.length ? parts.join(", ") : null;
}

/**
 * Where the phone is, once, or null.
 *
 * Wrapped in a promise so that "this browser has no geolocation at all" and
 * "the person said no" arrive the same way — as an answer, asynchronously.
 * Callers then have one path instead of two, and none of them has to set state
 * from inside an effect body to handle the case where there was nothing to ask.
 *
 * Never rejects. A refusal is an answer, not a failure: every screen here works
 * without a fix, and one that threw would make the absence of a location look
 * like something going wrong.
 */
export function currentFix(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      // Refused, unavailable, timed out — all the same answer.
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}
