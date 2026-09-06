import { NextResponse } from "next/server";
import { getViewer } from "@/lib/access";
import { KIOSK_COOKIE, kioskLandingPath } from "@/lib/kiosk";

/**
 * Lock the device to the catalogue.
 *
 * The cookie is `httpOnly`, so nothing running on the page can clear it — not
 * a bookmarklet, not a stray script, not a curious customer who knows about
 * the console. Whoever owns the device can still clear it from the browser's
 * own settings, and that is the honest ceiling here.
 *
 * `sameSite: lax` rather than strict: the redirect the middleware issues is a
 * top-level navigation, and strict would drop the cookie on the way.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { view } = await request.json().catch(() => ({ view: null }));
  if (typeof view !== "string" || view === "") {
    return NextResponse.json({ error: "No view given." }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true, to: kioskLandingPath(view) });
  response.cookies.set(KIOSK_COOKIE, view, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // A day. Long enough for the longest round of visits, short enough that a
    // phone left locked overnight is usable again in the morning without
    // anybody having to remember how it got that way.
    maxAge: 60 * 60 * 24,
  });
  return response;
}
