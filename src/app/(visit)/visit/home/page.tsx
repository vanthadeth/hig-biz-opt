import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/access";
import { greetingFor } from "@/lib/dashboard";
import {
  VISIT_COLUMNS,
  durationLabel,
  periodRange,
  summarise,
  type Visit,
} from "@/lib/visits";
import { VisitDashboard } from "./VisitDashboard";

/**
 * What is true right now.
 *
 * The one thing a rep opening this app needs to know is whether they are still
 * checked in somewhere, so that is the top of the page. Everything under it is
 * today, which is the only period a dashboard should be answering — the rest is
 * the report's job.
 */
export default async function Page() {
  const viewer = await requireViewer();
  const supabase = await createClient();

  const now = new Date();
  const { from } = periodRange("today", now);

  // Today's visits, plus anything still open from before today: a rep who
  // checked in at eleven last night and never checked out has to be able to find
  // that visit, and it is not in today.
  const [today, stillOpen] = await Promise.all([
    supabase
      .from("visit_log")
      .select(VISIT_COLUMNS)
      .gte("checked_in_at", from.toISOString())
      .order("checked_in_at", { ascending: false }),
    supabase
      .from("visit_log")
      .select(VISIT_COLUMNS)
      .is("checked_out_at", null)
      .eq("user_id", viewer.id)
      .maybeSingle(),
  ]);

  const visits = (today.data ?? []) as unknown as Visit[];
  const open = (stillOpen.data as unknown as Visit | null) ?? null;

  return (
    <VisitDashboard
      firstName={viewer.nickname || viewer.full_name.split(" ")[0]}
      greeting={greetingFor(now)}
      today={now.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })}
      open={open}
      openFor={
        open
          ? durationLabel(
              Math.max(
                0,
                Math.round(
                  (now.getTime() - new Date(open.checked_in_at).getTime()) / 60_000,
                ),
              ),
            )
          : null
      }
      visits={visits}
      counts={summarise(visits)}
    />
  );
}
