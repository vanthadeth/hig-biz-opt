import Link from "next/link";
import { Icon } from "@/components/Icon";
import { serverT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { REPORT_COLUMNS, type ReportVisit } from "@/lib/visits";
import { VisitMapView } from "./VisitMapView";

/**
 * The same ninety days the report reads, drawn instead of counted.
 *
 * Whose visits appear is the policy's decision, not this query's — the screen
 * never filters by user, so it cannot disagree with the database about who may
 * be seen.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  const supabase = await createClient();
  const t = await serverT();
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
        {t("visit.allVisits")}
      </Link>

      <VisitMapView visits={(data ?? []) as unknown as ReportVisit[]} />
    </div>
  );
}
