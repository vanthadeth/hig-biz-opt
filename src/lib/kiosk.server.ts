import { cookies } from "next/headers";
import { KIOSK_COOKIE, readKioskCookie, type KioskLock } from "@/lib/kiosk";

/**
 * The view this device is locked to, read on the server.
 *
 * Server only — it reads `next/headers`. A client component that imports a
 * value from here drags server code into the browser bundle and fails the
 * build, which is why the pure half lives in `kiosk.ts` and everything on a
 * page imports from there.
 *
 * The cookie is `httpOnly`, so the page cannot see it: without this the shell
 * would have no idea it is locked.
 */
export async function kioskLock(): Promise<KioskLock | null> {
  return readKioskCookie((await cookies()).get(KIOSK_COOKIE)?.value, Date.now());
}

/** Just the view, for the callers that only need to know whether it is locked. */
export async function lockedView(): Promise<string | null> {
  return (await kioskLock())?.view ?? null;
}
