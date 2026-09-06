/**
 * Catalogue browsing, with the rest of the app shut.
 *
 * A rep opens the catalogue, hands their phone to the shopkeeper, and the
 * shopkeeper picks things off it. While that is happening the customer book,
 * the prices of other shops and the employee list must not be one back-swipe
 * away. Kiosk mode is that state, and the PIN is what ends it.
 *
 * What it defends against: a customer wandering out of the catalogue, by
 * accident or curiosity. That is the thing that actually happens.
 *
 * What it does not defend against: whoever owns the device. The signed-in
 * session is still in that browser, and anybody who can open the developer
 * tools can delete a cookie. Saying otherwise would be a lie somebody later
 * builds on. The cookie is `httpOnly` so page scripts cannot clear it, which
 * is the honest ceiling for a web app.
 */

/**
 * Its value is the view that was locked and the moment the lock was last known
 * to be alive: `sales.1738900000000`. The view is there so unlocking returns
 * somebody where they were rather than to a chooser; the stamp is there so the
 * lock cannot outlive the hand-over that started it.
 */
export const KIOSK_COOKIE = "hig_kiosk";

/**
 * How long a lock survives with nobody keeping it alive.
 *
 * The app must never start into a customer-facing catalogue: opening it the
 * next morning has nothing to do with a phone handed over yesterday. A cookie
 * cannot express that on its own — "until the browser closes" is a promise
 * browsers break, since a phone that restores its tabs restores its session
 * cookies with them.
 *
 * So a lock is only honoured while an open catalogue keeps saying it is still
 * there. Close the app and the saying stops, and the lock is dead within
 * minutes whatever the browser chose to restore.
 *
 * Why minutes rather than instantly: a lock that ended the moment the app was
 * closed could be escaped by closing the app, which a customer holding the
 * phone can do with one gesture. Five minutes is long enough to survive the
 * browser dropping a backgrounded tab and the customer coming back to it, and
 * short enough that no ordinary launch is inside it — and a rep who wants out
 * now types their PIN, which ends it on the spot.
 */
export const KIOSK_GRACE_MS = 5 * 60 * 1000;

/** The cookie for a lock alive at `atMs`. */
export function kioskCookieValue(viewKey: string, atMs: number): string {
  return `${viewKey}.${atMs}`;
}

/**
 * The view a cookie locks the device to, or null when it locks nothing.
 *
 * Null covers all three ways a lock is not a lock: no cookie, a value that is
 * not one of ours, and — the one that matters — a lock nothing has kept alive.
 */
export function readKioskCookie(
  value: string | undefined,
  nowMs: number,
): string | null {
  if (!value) return null;

  // From the last dot: a view key could contain one, a timestamp cannot.
  const cut = value.lastIndexOf(".");
  if (cut <= 0) return null;

  const viewKey = value.slice(0, cut);
  const stamp = Number(value.slice(cut + 1));
  if (!Number.isFinite(stamp)) return null;

  // A stamp from the future is a clock that moved, not a hand-over. Treated as
  // dead rather than eternal: the failure that leaves the app usable is the one
  // to prefer when the alternative is a phone locked by arithmetic.
  if (stamp > nowMs) return nowMs - stamp > -KIOSK_GRACE_MS ? viewKey : null;

  return nowMs - stamp <= KIOSK_GRACE_MS ? viewKey : null;
}

/** Where a locked device is allowed to be. */
export function kioskLandingPath(viewKey: string): string {
  return `/${viewKey}/products`;
}

/**
 * May this path be served while the device is locked?
 *
 * An allow-list, not a deny-list: a route added next year is locked out by
 * default rather than quietly reachable because nobody remembered this file.
 */
export function kioskAllows(pathname: string, viewKey: string): boolean {
  // The catalogue itself, and anything beneath it.
  const landing = kioskLandingPath(viewKey);
  if (pathname === landing || pathname.startsWith(`${landing}/`)) return true;

  // The endpoints that end the lock. Without these there is no way out.
  if (pathname.startsWith("/api/kiosk/")) return true;

  return false;
}

/** Four digits, and nothing else. */
export function isPinShaped(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}

/**
 * What to say when a PIN is refused.
 *
 * The count is deliberately shown: somebody who has typed it wrong twice
 * should know they are close to being locked out, rather than discovering it
 * at the moment it happens.
 */
export function pinAttemptsMessage(remaining: number): string {
  if (remaining <= 0) return "That PIN is wrong.";
  if (remaining === 1) return "That PIN is wrong. One more try before it locks.";
  return `That PIN is wrong. ${remaining} tries left.`;
}
