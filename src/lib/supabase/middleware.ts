import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { KIOSK_COOKIE, kioskAllows, kioskLandingPath } from "@/lib/kiosk";

/**
 * Routes reachable without a session.
 *
 * The two sync endpoints are here because nobody is signed in when a cron fires
 * at 3am or a spreadsheet reports a change. They are not unprotected: the tick
 * checks a shared secret and the hook's whole path is a random token. Sending
 * them to /login would turn both into a redirect nothing follows.
 */
const PUBLIC_PATHS = ["/login", "/auth", "/api/sync/tick", "/api/sync/hook"];

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
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Kiosk: the phone is in a customer's hands, so nothing but the catalogue is
  // served until somebody types the PIN. Enforced here rather than by hiding
  // buttons, because a hidden button is not a lock — the address bar is right
  // there, and so is the back gesture.
  const lockedView = request.cookies.get(KIOSK_COOKIE)?.value;
  if (user && lockedView && !kioskAllows(pathname, lockedView)) {
    const url = request.nextUrl.clone();
    url.pathname = kioskLandingPath(lockedView);
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
