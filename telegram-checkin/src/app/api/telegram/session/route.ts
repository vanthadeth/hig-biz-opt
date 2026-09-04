import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { mintSession, readLaunch } from "@/lib/session";

/**
 * Exchange a Telegram launch for a Supabase session.
 *
 * Answers one of three ways, and the page has a screen for each:
 *   200  signed in, here is who you are
 *   404  this Telegram account is not bound to anybody yet — sign in once
 *   403  it is bound, but that person may not work right now
 */
export async function POST(request: Request) {
  let initData: unknown;
  try {
    ({ initData } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const launch = readLaunch(initData);
  if (!launch.ok) {
    return NextResponse.json({ error: launch.message }, { status: launch.status });
  }

  // Already signed in. Minting again inside Supabase's magic-link window would
  // hand back a token that has been spent, so the cheapest correct thing is not
  // to ask for one.
  const supabase = await createClient();
  const {
    data: { user: existing },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: employee, error } = await admin
    .from("users")
    .select("id, full_name, nickname, photo_path, email, status")
    .eq("telegram_user_id", launch.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not reach the employee record." }, { status: 502 });
  }

  if (!employee) {
    return NextResponse.json(
      { error: "This Telegram account is not linked to anybody yet.", needsBinding: true },
      { status: 404 },
    );
  }

  if (employee.status !== "active") {
    return NextResponse.json(
      { error: "Your account is not active. Speak to HR." },
      { status: 403 },
    );
  }

  // A session belonging to somebody else means the phone changed hands, or the
  // account was re-bound. Trust the launch over the cookie.
  if (existing && existing.id === employee.id) {
    return NextResponse.json({ employee: publicFields(employee) });
  }

  if (!(await mintSession(employee.id))) {
    return NextResponse.json(
      {
        error: "Could not sign you in automatically. Sign in once more.",
        needsBinding: true,
      },
      { status: 401 },
    );
  }

  return NextResponse.json({ employee: publicFields(employee) });
}

type EmployeeRow = {
  id: string;
  full_name: string;
  nickname: string | null;
  photo_path: string | null;
  email: string | null;
  status: string;
};

/** The admin client sees every column; only these four leave the handler. */
function publicFields(employee: EmployeeRow) {
  return {
    id: employee.id,
    full_name: employee.full_name,
    nickname: employee.nickname,
    photo_path: employee.photo_path,
  };
}
