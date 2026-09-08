import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { NO_QUOTA, QUOTA_COLUMNS, effectiveQuota, type Quota } from "@/lib/quota";
import { VISIT_COLUMNS, type VisitRow } from "@/lib/visits";
import { VisitDay } from "@/app/(app)/[view]/visits/VisitDay";

export const metadata: Metadata = { title: { absolute: "HIG Footprint" } };

/**
 * The whole of HIG Footprint: a rep's day, check-in to check-out.
 *
 * The same screen the main app's `/[view]/visits` shows, reused rather than
 * rebuilt — a rep's day does not become a different thing for living behind a
 * different door. `links={false}` is the only difference: this app has no
 * report and no map for those two buttons to open, so `VisitDay` leaves them
 * out rather than offering a route that would 404.
 */
export default async function FootprintPage() {
  const supabase = await createClient();
  const now = new Date();

  const me = await supabase.auth.getUser();
  const userId = me.data.user?.id ?? null;

  if (!userId) {
    return (
      <Card className="p-6 text-center text-sm text-muted">
        Sign in to record a visit.
      </Card>
    );
  }

  const [visits, settings, own, provinces, permissions] = await Promise.all([
    supabase
      .from("visits")
      .select(VISIT_COLUMNS)
      .gte("checked_in_at", new Date(now.getTime() - 14 * 86_400_000).toISOString())
      .order("checked_in_at", { ascending: false })
      .limit(200),
    supabase.from("app_settings").select(QUOTA_COLUMNS).maybeSingle(),
    supabase.from("user_visit_quotas").select(QUOTA_COLUMNS).eq("user_id", userId).maybeSingle(),
    supabase.from("geo_provinces").select("code, name"),
    getMyPermissions(),
  ]);

  const rows = (visits.data ?? []) as unknown as VisitRow[];
  const orgQuota = (settings.data as Quota | null) ?? NO_QUOTA;
  const quota = effectiveQuota((own.data as Quota | null) ?? NO_QUOTA, orgQuota);
  const provinceNames = ((provinces.data ?? []) as { code: string; name: string }[]).map(
    (province) => [province.code, province.name] as [string, string],
  );

  return (
    <VisitDay
      viewKey="footprint"
      userId={userId}
      visits={rows}
      quota={quota}
      provinces={provinceNames}
      now={now.toISOString()}
      canCheckIn={can(permissions, "visit", "add")}
      links={false}
    />
  );
}
