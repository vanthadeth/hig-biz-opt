import { PageTitle } from "@/components/PageTitle";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { CART_CUSTOMER_COLUMNS, type CartCustomer } from "@/lib/catalog";
import { OPTION_COLUMNS, VISIT_COLUMNS, type VisitOption, type VisitRow } from "@/lib/visits";
import { VisitDay } from "./VisitDay";

/**
 * A rep's day, from the phone they are carrying.
 *
 * One screen, two states. Not checked in: the shops nearby, closest first,
 * with a button. Checked in: the visit itself, open for writing, with a button
 * that closes it. Everything else on the page — the calls already made today,
 * the hours they add up to — is below that, because the thing somebody has
 * their thumb on is the only part that matters while they are standing outside
 * a shop.
 *
 * Whose visits appear is the policy's decision, not this query's: a rep with
 * `visit.view` at 'own' sees their own, a supervisor at 'sub' sees the
 * department's. The screen never filters by user, so it cannot disagree with
 * the database about who may see what.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  const supabase = await createClient();

  // One reading of the clock, shared by the query below and by the screen, so
  // the fortnight the page asks for is the fortnight it says it is showing.
  const now = new Date();

  const [me, visits, options, customers, settings] = await Promise.all([
    supabase.auth.getUser(),
    // A fortnight is enough for the day list and the correction window, and
    // keeps a rep's first paint small on a phone.
    supabase
      .from("visits")
      .select(VISIT_COLUMNS)
      .gte("checked_in_at", new Date(now.getTime() - 14 * 86_400_000).toISOString())
      .order("checked_in_at", { ascending: false })
      .limit(200),
    supabase.from("visit_options").select(OPTION_COLUMNS).eq("active", true),
    supabase.from("customers").select(CART_CUSTOMER_COLUMNS).eq("status", "active"),
    supabase.from("app_settings").select("checkin_radius_m").maybeSingle(),
  ]);

  const userId = me.data.user?.id ?? null;
  const rows = (visits.data ?? []) as unknown as VisitRow[];

  if (!userId) {
    return (
      <div className="space-y-4">
        <PageTitle />
        <Card className="p-6 text-center text-sm text-muted">
          Sign in to record a visit.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageTitle />
      <VisitDay
        viewKey={view}
        userId={userId}
        visits={rows}
        options={(options.data ?? []) as VisitOption[]}
        customers={(customers.data ?? []) as CartCustomer[]}
        radiusM={settings.data?.checkin_radius_m ?? 200}
        now={now.toISOString()}
      />
    </div>
  );
}
