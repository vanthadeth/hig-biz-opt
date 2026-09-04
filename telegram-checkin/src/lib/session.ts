import { botToken, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyInitData, type TelegramUser } from "@/lib/initData";

/** What the page needs to know about the person, once there is a session. */
export type Employee = {
  id: string;
  full_name: string;
  nickname: string | null;
  photo_path: string | null;
  email: string | null;
};

export const EMPLOYEE_COLUMNS = "id, full_name, nickname, photo_path, email, status";

export type Launch =
  | { ok: true; user: TelegramUser }
  | { ok: false; status: number; message: string };

/**
 * Check that a launch really came from Telegram, and say who opened it.
 *
 * Every handler starts here. Nothing read out of initData means anything until
 * the signature has been checked, so no field is touched before it passes.
 */
export function readLaunch(initData: unknown): Launch {
  if (typeof initData !== "string") {
    return { ok: false, status: 400, message: "This has to be opened from Telegram." };
  }

  const result = verifyInitData(initData, botToken());
  if (result.ok) return { ok: true, user: result.data.user };

  if (result.problem === "stale") {
    return { ok: false, status: 401, message: "This session has expired. Close and reopen the app." };
  }
  return { ok: false, status: 401, message: "This has to be opened from Telegram." };
}

/**
 * Turn a verified Telegram account into a real Supabase cookie session.
 *
 * The mint is a magic link generated and immediately spent: generateLink does
 * not send an email, and verifyOtp on a cookie-writing client is what puts the
 * session in the response. From there the page is an ordinary signed-in client
 * and every policy written for the web app applies untouched.
 *
 * Supabase rate-limits magic links per user, and inside that window
 * generateLink hands back the token it issued last time rather than a new one —
 * which verifyOtp has already spent. That is why the caller checks for an
 * existing session first and why a failure here falls back to the sign-in panel
 * rather than to an error page.
 */
export async function mintSession(userId: string): Promise<boolean> {
  const admin = createAdminClient();

  // Look the login up before asking for a link, and give up if there is not
  // one. This is the load-bearing line of the whole feature.
  //
  // Since 0016 an employee may exist with no login at all, and public.users.id
  // is the auth id only for those who have one. GoTrue's admin generate-link
  // handler, asked for a magic link for an address it cannot find, rewrites the
  // request into a signup and creates the account — so calling it blind would
  // silently hand a login, with a password nobody knows, to somebody who was
  // deliberately never given one, and handle_new_auth_user would then re-key
  // their employee record onto it.
  const { data: login, error: loginError } = await admin.auth.admin.getUserById(userId);
  const email = login?.user?.email;
  if (loginError || !email) return false;

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return false;

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });

  return !verifyError;
}

/** The signed-in employee, read through their own session so RLS applies. */
export async function currentEmployee(): Promise<Employee | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, full_name, nickname, photo_path, email")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Employee | null) ?? null;
}
