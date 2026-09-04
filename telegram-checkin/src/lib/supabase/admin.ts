import { createClient } from "@supabase/supabase-js";

/**
 * The secret-key client. Bypasses row level security, so it does exactly three
 * things and nothing else: find the employee behind a Telegram account, bind
 * one, and mint a session.
 *
 * Built per request rather than at module scope, so `next build` never needs
 * the key — which is what keeps CI free of secrets.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Read once, here, so a missing token is one error rather than four. */
export function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return token;
}
