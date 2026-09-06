import { NextResponse } from "next/server";
import { getViewer } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePassword } from "@/lib/passwords";

/**
 * Give somebody a login, or a new password for the one they have.
 *
 * Super admin only, and checked here rather than trusted from the page: this
 * route holds the service role key, which bypasses every policy in the
 * database. It is the one place in the app where that is true, so the guard is
 * the first thing in it.
 *
 * The password is generated on the server, returned once, and stored nowhere.
 * Sending it is deliberately not this app's job — it goes into Telegram, or is
 * read down a phone, by the person who asked for it. Emailing credentials from
 * here would put them in a mailbox neither of us controls.
 *
 * The auth account is created with the employee record's own id, so a person
 * has one identity rather than two rows that have to be matched up later.
 * 0016 made that possible by letting the record exist first; this is the other
 * half of it.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!viewer.is_super_admin) {
    return NextResponse.json(
      { error: "Only a super admin can set somebody's password." },
      { status: 403 },
    );
  }

  const { id } = await params;

  // Read through the caller's own client, so this cannot be used to discover
  // rows the caller could not otherwise see.
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("id", id)
    .maybeSingle();

  if (!person) {
    return NextResponse.json({ error: "No such person." }, { status: 404 });
  }
  if (!person.email) {
    return NextResponse.json(
      {
        error:
          "This record has no email address, so there is nothing to sign in with. Add one first.",
      },
      { status: 400 },
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    // The key is missing or unreadable. Said plainly: this is a deployment
    // fact, not something the person clicking can fix by trying again.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "The service key is not configured." },
      { status: 500 },
    );
  }

  const password = generatePassword();

  // Create with the record's own id. The trigger on auth.users inserts a
  // profile row `on conflict (id) do nothing`, so keying the account to the id
  // that already exists means it finds one and does nothing — one person, one
  // row, no matching up afterwards.
  const created = await admin.auth.admin.createUser({
    id: person.id,
    email: person.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: person.full_name },
  });

  if (!created.error) {
    return NextResponse.json({ ok: true, password, email: person.email, created: true });
  }

  // Already has an account. Setting a new password on it is the other half of
  // what this route is for, so this is the ordinary path rather than a failure.
  const updated = await admin.auth.admin.updateUserById(person.id, { password });
  if (updated.error) {
    return NextResponse.json(
      {
        error:
          `The password could not be set: ${updated.error.message}. `
          + "If this person signed up under a different account, that one has to be removed first.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, password, email: person.email, created: false });
}
