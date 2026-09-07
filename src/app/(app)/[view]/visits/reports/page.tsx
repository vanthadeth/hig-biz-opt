import Link from "next/link";
import { Icon } from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import { REPORT_COLUMNS, type ReportVisit } from "@/lib/visits";
import { VisitReport } from "./VisitReport";

/**
 * What the days added up to.
 *
 * Whose days appear is the policy's decision, not this query's: at 'own' a rep
 * reports on themselves, at 'sub' a supervisor on the department, at 'any' the
 * office on everybody. The screen never filters by user, so it cannot disagree
 * with the database about who may be reported on.
 *
 * Ninety days is the window. A quarter is what anybody actually looks back
 * over, and an unbounded query on a table that grows by twenty rows a rep a
 * day is a page that gets slower every week without anybody deciding it should.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  const supabase = await createClient();
  const now = new Date();

  const { data } = await supabase
    .from("visits")
    .select(REPORT_COLUMNS)
    .gte("checked_in_at", new Date(now.getTime() - 90 * 86_400_000).toISOString())
    .order("checked_in_at", { ascending: false })
    .limit(5000);

  return (
    <div className="space-y-4">
      <Link
        href={`/${view}/visits`}
        className="pressable inline-flex min-h-9 items-center gap-1 text-sm text-muted"
      >
        <Icon name="chevron" className="size-4 rotate-180" />
        All visits
      </Link>

      <VisitReport
        visits={(data ?? []) as unknown as ReportVisit[]}
        now={now.toISOString()}
      />
    </div>
  );
}
