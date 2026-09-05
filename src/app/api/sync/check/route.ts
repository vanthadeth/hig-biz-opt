import { NextResponse } from "next/server";
import { can, getMyPermissions, getViewer } from "@/lib/access";
import { checkCredential, GoogleSheetsError, serviceAccountStatus } from "@/lib/google/sheets";
import { createAdminClient, serverKey } from "@/lib/supabase/admin";

/**
 * Do the two credentials a sync needs actually work?
 *
 * Worth its own endpoint because every other answer is indirect. Reading a
 * sheet can fail for the credential or for the sharing, and a person staring at
 * one red sentence cannot tell which they are fixing. This asks Google for a
 * token and nothing else, so a pass means the credential is right and anything
 * still failing afterwards is about the sheet.
 *
 * The service account's address comes back on success. It is not a secret — it
 * is the thing you have to share your sheets with — and the key itself never
 * leaves the server.
 */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const permissions = await getMyPermissions();
  if (!can(permissions, "data_sync", "view")) {
    return NextResponse.json({ error: "You may not check this." }, { status: 403 });
  }

  // Both, in one answer. They fail independently and a person checking one at
  // a time gets told about the second only after fixing the first.
  const supabase = await checkSupabase();

  const status = serviceAccountStatus();
  if (status.state === "missing") {
    return NextResponse.json({
      ok: false,
      supabase,
      code: "no_credential",
      message:
        "The server sees no GOOGLE_SERVICE_ACCOUNT_JSON at all. If you have set it, "
        + "check it is set for the environment you are looking at, and that the app "
        + "has been redeployed since.",
    });
  }
  if (status.state === "unreadable") {
    return NextResponse.json({
      ok: false,
      supabase,
      code: "bad_credential",
      message: status.reason,
    });
  }

  try {
    const { email } = await checkCredential();
    return NextResponse.json({
      ok: true,
      supabase,
      email,
      message: `Google accepted the account. Share your sheets with ${email} as a Viewer.`,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      supabase,
      code: e instanceof GoogleSheetsError ? e.code : "other",
      message:
        e instanceof Error ? e.message : "Google refused the account, without saying why.",
    });
  }
}

/**
 * The server key, proved rather than merely present.
 *
 * A key that is set but wrong looks identical to a correct one until something
 * uses it, so this uses it: one trivial read through the admin client, which
 * only a key with the service role can make.
 */
async function checkSupabase(): Promise<{ ok: boolean; message: string }> {
  if (!serverKey()) {
    return {
      ok: false,
      message:
        "No Supabase server key is set, so no sync can run — not even Run now. "
        + "Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) and redeploy.",
    };
  }

  try {
    const { error } = await createAdminClient()
      .from("sync_targets")
      .select("table_name")
      .limit(1);
    if (error) throw new Error(error.message);
    return { ok: true, message: "The Supabase server key works." };
  } catch (e) {
    return {
      ok: false,
      message: `The Supabase server key is set but was refused: ${
        e instanceof Error ? e.message : "no reason given"
      }`,
    };
  }
}
