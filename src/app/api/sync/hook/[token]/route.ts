import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSync } from "@/lib/syncEngine";

/**
 * Called by the Apps Script installed in the sheet when its contents change.
 *
 * The token in the path is the whole credential, so this answers the same way
 * for a token that does not exist and one whose sync is switched off: telling
 * the difference would let somebody find a valid token by trying.
 *
 * The script is read-only from our side. It runs inside their spreadsheet and
 * tells us something happened; it never sends us the data, and we never send it
 * anything.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Not the request's own client: there is no session here, and the lookup has
  // to happen before we know whether the caller is entitled to anything.
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sync_definitions")
    .select("id")
    .eq("hook_token", token)
    .eq("active", true)
    .eq("trigger_kind", "change")
    .maybeSingle();

  if (!data) return NextResponse.json({ ok: true }, { status: 202 });

  const outcome = await runSync(data.id, "change");
  return NextResponse.json({ ok: outcome.status === "ok" });
}
