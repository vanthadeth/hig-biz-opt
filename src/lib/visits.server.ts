import { createClient } from "@/lib/supabase/server";

/**
 * The visit this person still has open, if any.
 *
 * Read on every request in the visit layout, because it is what the centre
 * button in the bar says. One row at most: `visits_one_open_per_person` in 0047
 * is the reason this can return an id rather than a list, and the reason the
 * button never has to ask which visit is meant.
 *
 * Whose visits are visible is the policy's decision, not this query's — the
 * `user_id` filter is here so a supervisor holding 'sub' scope sees their own
 * open visit rather than the first one their team happens to have.
 */
export async function openVisitId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("visits")
    .select("id")
    .eq("user_id", user.id)
    .is("checked_out_at", null)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}
