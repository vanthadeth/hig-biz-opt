import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * The service-role client, which no policy applies to.
 *
 * There is exactly one thing in this app that needs it: the sync engine, which
 * runs on a schedule or from a webhook and so has no signed-in person whose
 * permissions it could borrow. Nothing else should import this.
 *
 * What stops it being a skeleton key is that it is not used as one. The engine
 * writes to a target table through `app.sync_apply`, which re-checks the target
 * against the registry and every column against the allow-list before it
 * composes a statement. The service role is what lets that function be called
 * at three in the morning; it is not what decides the function is safe.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Scheduled and webhook syncs cannot run without it.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
