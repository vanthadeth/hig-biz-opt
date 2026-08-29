import { createClient } from "@/lib/supabase/server";

export type HomeSummary = {
  /** People this viewer is allowed to see — RLS decides, not the query. */
  teamCount: number;
  roleCount: number;
  departmentCount: number;
};

/**
 * The counts the dashboard can state truthfully today.
 *
 * Deliberately narrow: the business tables do not exist yet, so there is
 * nothing to count for customers, orders or invoices. Those tiles arrive with
 * their modules rather than being faked now.
 */
export async function getHomeSummary(): Promise<HomeSummary> {
  const supabase = await createClient();

  const [team, roles, departments] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("roles").select("id", { count: "exact", head: true }),
    supabase.from("departments").select("id", { count: "exact", head: true }),
  ]);

  return {
    teamCount: team.count ?? 0,
    roleCount: roles.count ?? 0,
    departmentCount: departments.count ?? 0,
  };
}

/** "Good morning" / "Good afternoon" / "Good evening", from the hour. */
export function greetingFor(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
