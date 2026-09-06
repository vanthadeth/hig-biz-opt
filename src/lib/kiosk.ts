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
 * Its value is the view that was locked, so unlocking returns somebody where
 * they were rather than to a chooser.
 */
export const KIOSK_COOKIE = "hig_kiosk";

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
