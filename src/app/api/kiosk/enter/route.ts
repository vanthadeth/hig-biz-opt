import { NextResponse } from "next/server";
import { getViewer } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { KIOSK_COOKIE, kioskCookieValue, kioskLandingPath } from "@/lib/kiosk";

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

  // No PIN, no lock. The PIN is the only way out, so locking without one does
  // not hand the phone over — it shuts the app on its owner.
  const supabase = await createClient();
  const { data: pinSet } = await supabase.rpc("my_pin_is_set");
  if (pinSet !== true) {
    return NextResponse.json(
      { error: "Set a four-digit PIN on your profile first. It is the way back out." },
      { status: 400 },
    );
  }

  // The browsing session this lock belongs to. Handed back so the page can
  // remember it: a page that later finds a different one — or none — is
  // looking at a lock left over from an app that has since been closed.
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  const response = NextResponse.json({
    ok: true,
    to: kioskLandingPath(view),
    nonce,
  });
  response.cookies.set(KIOSK_COOKIE, kioskCookieValue(view, Date.now(), nonce), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // No maxAge, so the browser is asked to drop it when this run of the app
    // ends. That is a request, not a guarantee — a phone that restores its tabs
    // restores its session cookies too — which is why the value carries the
    // moment it was last alive and the middleware reads that rather than the
    // mere presence of a cookie.
  });
  return response;
}
