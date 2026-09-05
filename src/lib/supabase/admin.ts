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
/**
 * Either name, because Supabase renamed the thing.
 *
 * The dashboard now calls it a secret key (`sb_secret_…`) and keeps the older
 * service_role JWT alongside it under legacy keys. Both bypass row level
 * security and both work here, so accepting one name and not the other would
 * only ever cost somebody an afternoon.
 */
export function serverKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    undefined
  );
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serverKey();

  if (!url || !key) {
    // Named accurately: every sync needs this, including one somebody starts by
    // hand. Saying "scheduled and webhook" sent people looking for a scheduling
    // problem they did not have.
    throw new Error(
      "No Supabase server key is set, so no sync can run — not even Run now. "
        + "Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) where the app "
        + "is hosted, then redeploy.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
