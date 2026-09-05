import { NextResponse } from "next/server";
import { can, getMyPermissions, getViewer } from "@/lib/access";
import { GoogleSheetsError, readSheet, readTabs, serviceAccountEmail } from "@/lib/google/sheets";
import { a1Range } from "@/lib/sync";

/**
 * What a sheet looks like, so the mapping screen can offer its tabs and columns
 * rather than ask somebody to type them and find out later.
 *
 * Returns headings and a couple of example rows. The examples are what make a
 * mapping screen usable: "Price" next to "1,250.50" is obvious, and "Price"
 * alone is a guess.
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const permissions = await getMyPermissions();
  if (!can(permissions, "data_sync", "view")) {
    return NextResponse.json({ error: "You may not read a sheet." }, { status: 403 });
  }

  const url = new URL(request.url);
  const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();
  const tab = url.searchParams.get("tab")?.trim();
  const headerRow = Number(url.searchParams.get("headerRow") ?? "1") || 1;

  if (!spreadsheetId) {
    return NextResponse.json({ error: "No spreadsheet given." }, { status: 400 });
  }

  try {
    const tabs = await readTabs(spreadsheetId);
    if (!tab) return NextResponse.json({ tabs, headers: [], samples: [] });

    const { headers, rows } = await readSheet(spreadsheetId, a1Range(tab, headerRow));
    return NextResponse.json({
      tabs,
      headers,
      // Three is enough to recognise a column and few enough not to put the
      // sheet's contents through the browser.
      samples: rows.slice(0, 3),
    });
  } catch (e) {
    // The code travels with the message so the screen can show setup steps for
    // a missing credential and a sharing instruction for a sheet we cannot
    // open, rather than the same red sentence for both.
    const known = e instanceof GoogleSheetsError;
    return NextResponse.json(
      {
        error: known ? e.message : "The sheet could not be read.",
        code: known ? e.code : "other",
        serviceAccount: serviceAccountEmail(),
      },
      { status: 400 },
    );
  }
}
