import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { VISIT_COLUMNS, type Visit } from "@/lib/visits";
import { VisitReport } from "./VisitReport";

/**
 * What did I do?
 *
 * One query, filtered in the browser, because the three periods are all inside
 * the same month and switching between them should cost nothing. Whose visits
 * come back is the policy's decision — a rep with `visit.view` at 'own' sees
 * their round, a supervisor at 'sub' sees their team's.
 *
 * The window is the calendar month plus the days of the week it started in, so
 * "this week" is whole even on the first of the month.
 */
export default async function Page() {
  const supabase = await createClient();

  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), 1);
  since.setDate(since.getDate() - 7);

  const { data } = await supabase
    .from("visit_log")
    .select(VISIT_COLUMNS)
    .gte("checked_in_at", since.toISOString())
    .order("checked_in_at", { ascending: false })
    .limit(500);

  const visits = (data ?? []) as unknown as Visit[];

  if (visits.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-muted">
          No visits this month yet. They appear here as you check out of them.
        </p>
      </Card>
    );
  }

  return <VisitReport visits={visits} />;
}
