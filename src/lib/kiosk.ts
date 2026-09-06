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
 * Its value is the view that was locked, the moment the lock was last known to
 * be alive, and the browsing session it belongs to:
 * `sales.1738900000000.a1b2c3`. The view is there so unlocking returns somebody
 * where they were; the stamp and the session are the two halves of "is this
 * lock still real".
 */
export const KIOSK_COOKIE = "hig_kiosk";

/**
 * Where the page remembers which lock it is inside.
 *
 * `sessionStorage`, not `localStorage`, and that is the whole idea: it survives
 * a reload of the same tab and dies when the app is closed. Reloading the
 * catalogue is something a rep does with a customer waiting, and it must not
 * unlock the phone; opening the app tomorrow is a different thing entirely and
 * must not open into a customer's catalogue.
 *
 * The value is the nonce from the cookie. A page that finds a different one —
 * or none — is looking at a lock from a browsing session that has ended.
 */
export const KIOSK_SESSION_KEY = "hig.kiosk.session";

/**
 * The backstop: how long a lock can survive with nothing keeping it alive.
 *
 * This used to be the whole mechanism, at five minutes, and it was wrong in
 * the way that matters. A phone in a customer's hand goes to sleep; the page
 * stops saying it is there; five minutes later the lock was gone, so pulling
 * the catalogue down to refresh it handed the customer the whole app.
 *
 * The browsing session decides now — see KIOSK_SESSION_KEY — and this is only
 * the fallback for the case that check cannot cover: a browser that restores
 * the cookie *and* the session storage on relaunch. Long enough that a day of
 * selling never trips it, short enough that it is dead by the next morning.
 */
export const KIOSK_GRACE_MS = 12 * 60 * 60 * 1000;

/** The cookie for a lock alive at `atMs`, belonging to one browsing session. */
export function kioskCookieValue(viewKey: string, atMs: number, nonce: string): string {
  return `${viewKey}.${atMs}.${nonce}`;
}

/** What a lock is, once the cookie has been read. */
export type KioskLock = { view: string; nonce: string };

/**
 * The view a cookie locks the device to, or null when it locks nothing.
 *
 * Null covers all three ways a lock is not a lock: no cookie, a value that is
 * not one of ours, and — the one that matters — a lock nothing has kept alive.
 */
export function readKioskCookie(
  value: string | undefined,
  nowMs: number,
): KioskLock | null {
  if (!value) return null;

  // Read from the right: the nonce and the stamp have no dots in them, and a
  // view key might.
  const parts = value.split(".");
  if (parts.length < 3) return null;

  const nonce = parts[parts.length - 1];
  const stamp = Number(parts[parts.length - 2]);
  const view = parts.slice(0, -2).join(".");
  if (view === "" || nonce === "" || !Number.isFinite(stamp)) return null;

  // A stamp from the future is a clock that moved, not a hand-over. Treated as
  // dead rather than eternal: the failure that leaves the app usable is the one
  // to prefer when the alternative is a phone locked by arithmetic.
  if (stamp > nowMs) {
    return nowMs - stamp > -KIOSK_GRACE_MS ? { view, nonce } : null;
  }

  return nowMs - stamp <= KIOSK_GRACE_MS ? { view, nonce } : null;
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
