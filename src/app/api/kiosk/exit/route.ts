import { NextResponse } from "next/server";
import { getViewer } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { isPinShaped, KIOSK_COOKIE } from "@/lib/kiosk";

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

  const { pin } = await request.json().catch(() => ({ pin: null }));
  if (typeof pin !== "string" || !isPinShaped(pin)) {
    return NextResponse.json({ ok: false, error: "A PIN is four digits." });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_my_pin", { p_pin: pin });

  if (error) {
    // A lockout and a missing PIN both arrive here, and both need saying out
    // loud rather than being flattened into "wrong PIN".
    return NextResponse.json({ ok: false, error: error.message });
  }

  if (data !== true) {
    return NextResponse.json({ ok: false, error: "That PIN is wrong." });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(KIOSK_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
