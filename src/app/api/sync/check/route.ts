import { NextResponse } from "next/server";
import { can, getMyPermissions, getViewer } from "@/lib/access";
import { checkCredential, GoogleSheetsError, serviceAccountStatus } from "@/lib/google/sheets";

/**
 * Does this app's Google credential actually work?
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

  const status = serviceAccountStatus();
  if (status.state === "missing") {
    return NextResponse.json({
      ok: false,
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
      code: "bad_credential",
      message: status.reason,
    });
  }

  try {
    const { email } = await checkCredential();
    return NextResponse.json({
      ok: true,
      email,
      message: `Google accepted the account. Share your sheets with ${email} as a Viewer.`,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      code: e instanceof GoogleSheetsError ? e.code : "other",
      message:
        e instanceof Error ? e.message : "Google refused the account, without saying why.",
    });
  }
}
