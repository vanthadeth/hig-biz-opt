import { NextResponse } from "next/server";
import { runDueSyncs } from "@/lib/syncEngine";

/**
 * Every interval sync that is due. Called by a cron, not by a person.
 *
 * The secret is compared in full rather than short-circuited on the first wrong
 * character, and a missing secret refuses everything: an unset environment
 * variable must not turn this into an open endpoint that anybody can use to
 * make the app hammer Google.
 */
function authorised(request: Request): boolean {
  // CRON_SECRET is the name Vercel Cron sends as a bearer token, so setting
  // that one alone is enough there. SYNC_TICK_SECRET is for any other
  // scheduler, and wins if both are set.
  const expected = process.env.SYNC_TICK_SECRET || process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (offered.length !== expected.length) return false;

  let differences = 0;
  for (let i = 0; i < expected.length; i += 1) {
    differences |= offered.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return differences === 0;
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const outcomes = await runDueSyncs();
  return NextResponse.json({
    ran: outcomes.length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    outcomes,
  });
}

// Vercel Cron issues a GET. Same work, same guard.
export const GET = POST;
