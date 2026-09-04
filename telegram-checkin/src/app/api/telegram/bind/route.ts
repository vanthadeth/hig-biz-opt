import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readLaunch } from "@/lib/session";

/**
 * First launch: tie this Telegram account to an employee record.
 *
 * The person proves who they are with the credentials they already use for the
 * web app. Signing in is what establishes the session, so nothing has to be
 * minted here — and because the sign-in happens on a cookie-writing client, the
 * page is signed in by the time this returns.
 *
 * The binding itself is written with the secret key. It cannot be done from the
 * browser: guard_self_edit refuses a self-service write to telegram_user_id,
 * which is the point of putting the column in that guard.
 */
export async function POST(request: Request) {
  let body: { initData?: unknown; email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const launch = readLaunch(body.initData);
  if (!launch.ok) {
    return NextResponse.json({ error: launch.message }, { status: launch.status });
  }

  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });

  if (signInError || !signIn.user) {
    // Deliberately the same message whether the address is unknown or the
    // password is wrong.
    return NextResponse.json({ error: "That email and password do not match." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: employee, error } = await admin
    .from("users")
    .select("id, full_name, nickname, photo_path, status, telegram_user_id")
    .eq("id", signIn.user.id)
    .maybeSingle();

  if (error || !employee) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "You have no employee record yet." }, { status: 403 });
  }

  if (employee.status !== "active") {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "Your account is not active. Speak to HR." }, { status: 403 });
  }

  if (
    employee.telegram_user_id !== null &&
    String(employee.telegram_user_id) !== String(launch.user.id)
  ) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "This account is already linked to a different Telegram account." },
      { status: 409 },
    );
  }

  if (employee.telegram_user_id === null) {
    const { error: bindError } = await admin
      .from("users")
      .update({ telegram_user_id: launch.user.id })
      .eq("id", employee.id);

    if (bindError) {
      await supabase.auth.signOut();
      // The unique index is the only thing that realistically fails here: this
      // Telegram account already belongs to somebody else's record.
      return NextResponse.json(
        { error: "That Telegram account is already linked to somebody else." },
        { status: 409 },
      );
    }
  }

  return NextResponse.json({
    employee: {
      id: employee.id,
      full_name: employee.full_name,
      nickname: employee.nickname,
      photo_path: employee.photo_path,
    },
  });
}
