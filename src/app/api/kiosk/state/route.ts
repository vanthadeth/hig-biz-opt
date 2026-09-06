import { NextResponse } from "next/server";
import { getViewer } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

/**
 * Whether the signed-in account has a PIN.
 *
 * The unlock pad needs to know before it draws itself: an account with no PIN
 * has nothing to type, and a keypad that cannot ever be right is a worse
 * answer than saying so. It gives nothing away — it is the caller's own
 * account, and the question is already answerable from their profile page.
 */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const supabase = await createClient();
  const { data } = await supabase.rpc("my_pin_is_set");
  return NextResponse.json({ pinSet: data === true });
}
