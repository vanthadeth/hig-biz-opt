import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getViewer } from "@/lib/access";
import { KIOSK_COOKIE, readKioskCookie } from "@/lib/kiosk";

/**
 * Drop a lock left over from a browsing session that has ended.
 *
 * The page asks for this when it finds a lock whose session it does not
 * remember: the app was closed and opened again, and the cookie came back with
 * it because the browser restored the tab. That is not a hand-over in progress,
 * so it must not open into a customer's catalogue.
 *
 * It takes no PIN, and that is worth being plain about. A customer holding the
 * phone could call it — but only from the developer tools, which is exactly
 * where they could delete the cookie by hand instead. It does not lower the
 * ceiling this feature has always had; it stops a rep's own phone opening into
 * a catalogue nobody asked it for.
 */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const lock = readKioskCookie((await cookies()).get(KIOSK_COOKIE)?.value, Date.now());

  const response = NextResponse.json({ ok: true, wasLocked: lock !== null });
  response.cookies.set(KIOSK_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
