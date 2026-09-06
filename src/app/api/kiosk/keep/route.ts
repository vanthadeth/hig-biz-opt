import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getViewer } from "@/lib/access";
import { KIOSK_COOKIE, kioskCookieValue, readKioskCookie } from "@/lib/kiosk";

/**
 * "The catalogue is still open, in somebody's hands."
 *
 * The open catalogue says this every minute or so. It is the whole reason the
 * app can promise never to start locked: a lock lives only while something is
 * saying this, and closing the app stops the saying. Whatever the browser then
 * restores — tab, session cookie, scroll position — comes back to a lock that
 * has already expired.
 *
 * It can only extend a lock that is still alive. A dead one cannot be revived
 * from here, so this is not a way back in: that is the Catalog button, which
 * needs somebody holding the phone to tap it.
 */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const view = readKioskCookie(
    (await cookies()).get(KIOSK_COOKIE)?.value,
    Date.now(),
  );
  if (!view) {
    // Gone. The page saying this is looking at a catalogue that is no longer
    // locked, and needs to reload into the ordinary app.
    return NextResponse.json({ ok: false, stale: true }, { status: 409 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(KIOSK_COOKIE, kioskCookieValue(view, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
