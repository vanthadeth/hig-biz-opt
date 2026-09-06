import { NextResponse } from "next/server";
import { getViewer } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { isPinShaped, KIOSK_COOKIE } from "@/lib/kiosk";

/** Clears the lock. Shared by both ways out below. */
function unlocked(body: Record<string, unknown>) {
  const response = NextResponse.json({ ok: true, ...body });
  response.cookies.set(KIOSK_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

/**
 * End the lock, if the PIN is right.
 *
 * The PIN is checked in the database, by a function that holds the hash and
 * counts the failures. Nothing about that check happens in the browser, and
 * nothing here learns the hash — a route that compared strings itself could be
 * made to skip the comparison.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const supabase = await createClient();

  // A lock with no key is not a lock, it is a trap. An account with no PIN can
  // no longer get in here at all, but a device locked before that rule existed
  // still can, and the person holding it needs a way out that is not "wait for
  // the cookie to die" or "clear your browser settings".
  const { data: pinSet } = await supabase.rpc("my_pin_is_set");
  if (pinSet !== true) {
    return unlocked({ noPin: true });
  }

  const { pin } = await request.json().catch(() => ({ pin: null }));
  if (typeof pin !== "string" || !isPinShaped(pin)) {
    return NextResponse.json({ ok: false, error: "A PIN is four digits." });
  }

  const { data, error } = await supabase.rpc("verify_my_pin", { p_pin: pin });

  if (error) {
    // A lockout needs saying out loud rather than being flattened into
    // "wrong PIN".
    return NextResponse.json({ ok: false, error: error.message });
  }

  if (data !== true) {
    return NextResponse.json({ ok: false, error: "That PIN is wrong." });
  }

  return unlocked({});
}
