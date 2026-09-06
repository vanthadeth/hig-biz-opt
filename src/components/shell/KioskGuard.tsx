import { KIOSK_SESSION_KEY } from "@/lib/kiosk";
import { KioskSession } from "./KioskSession";

/**
 * Ends a lock that belongs to a browsing session which is over.
 *
 * The lock lives in a cookie the page cannot read, and cookies survive the app
 * being closed — a phone that restores its tabs restores them too. The browsing
 * session is what actually ended, and `sessionStorage` is the one thing in a
 * browser that means exactly that: it survives a reload of the same tab and
 * dies when the app closes.
 *
 * So the page remembers which lock it is inside, and a page that finds a
 * different nonce — or none at all — is looking at yesterday's lock.
 *
 * The script is inline and blocking for the same reason the theme one is:
 * anything deferred paints first, and what would paint is a customer-facing
 * catalogue on somebody's own phone. It hides the page instead, and the
 * component below then clears the lock and leaves.
 */
export function KioskGuard({ nonce, homeHref }: { nonce: string; homeHref: string }) {
  const script = `
(function(){try{
var n=sessionStorage.getItem(${JSON.stringify(KIOSK_SESSION_KEY)});
if(n!==${JSON.stringify(nonce)})document.documentElement.dataset.kioskOrphan="1";
}catch(e){}})();`.replace(/\n/g, "");

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <KioskSession homeHref={homeHref} />
    </>
  );
}
