import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  KIOSK_COOKIE,
  kioskAllows,
  kioskLandingPath,
  readKioskCookie,
} from "@/lib/kiosk";

/**
 * Routes reachable without a session.
 *
 * The two sync endpoints are here because nobody is signed in when a cron fires
 * at 3am or a spreadsheet reports a change. They are not unprotected: the tick
 * checks a shared secret and the hook's whole path is a random token. Sending
 * them to /login would turn both into a redirect nothing follows.
 *
 * `/field/login` is here for the same reason `/login` is: the field app is a
 * separate front door with its own sign-in screen, and that screen has to be
 * reachable by somebody who is not signed in yet — which is everybody who
 * needs it.
 */
const PUBLIC_PATHS = ["/login", "/field/login", "/auth", "/api/sync/tick", "/api/sync/hook"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getUser: a stray await here
  // makes sessions randomly fail to refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    // Whoever knocked stays at the door they knocked on: a field-app URL sends
    // somebody signed out to /field/login, not the main app's /login, so the
    // "own login" the field app is for actually holds when it matters —
    // reaching a page while signed out.
    const inField = pathname === "/field" || pathname.startsWith("/field/");
    url.pathname = inField ? "/field/login" : "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Kiosk: the phone is in a customer's hands, so nothing but the catalogue is
  // served until somebody types the PIN. Enforced here rather than by hiding
  // buttons, because a hidden button is not a lock — the address bar is right
  // there, and so is the back gesture.
  const lock = request.cookies.get(KIOSK_COOKIE)?.value;
  const lockedView = readKioskCookie(lock, Date.now())?.view ?? null;
  if (user && lockedView && !kioskAllows(pathname, lockedView)) {
    const url = request.nextUrl.clone();
    url.pathname = kioskLandingPath(lockedView);
    url.search = "";
    return NextResponse.redirect(url);
  }

  // A lock nobody kept alive is swept up rather than left to be read again on
  // every request. This is the line that makes a restored tab harmless: the
  // browser may bring the cookie back, but it comes back dead.
  if (lock && !lockedView) {
    response.cookies.set(KIOSK_COOKIE, "", { path: "/", maxAge: 0 });
  }

  if (user && (pathname === "/login" || pathname === "/field/login")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/field/login" ? "/field" : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
