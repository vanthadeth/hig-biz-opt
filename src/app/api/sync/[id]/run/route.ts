import { NextResponse } from "next/server";
import { can, getMyPermissions, getViewer } from "@/lib/access";
import { runSync } from "@/lib/syncEngine";

/**
 * Run one sync now, because somebody pressed the button.
 *
 * Gated on `data_sync.edit` rather than `view`: running a sync writes to a
 * table, and looking at a sync's settings is a different thing from making it
 * happen.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const permissions = await getMyPermissions();
  if (!can(permissions, "data_sync", "edit")) {
    return NextResponse.json({ error: "You may not run a sync." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const outcome = await runSync(id, "manual", viewer.id);
    return NextResponse.json(outcome);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "The sync could not be started." },
      { status: 400 },
    );
  }
}
