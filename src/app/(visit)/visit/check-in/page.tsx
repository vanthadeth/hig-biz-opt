import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { NEARBY_CUSTOMER_COLUMNS, type NearbyCustomer } from "@/lib/geo";
import { openVisitId } from "@/lib/visits.server";
import { CheckInList } from "./CheckInList";

/**
 * Which shop are you in?
 *
 * Which customers appear is the policy's decision, not this query's — a rep with
 * `customer.view` at 'own' scope is offered their own shops, at 'sub' their
 * department's. The order they appear in is the phone's job, and happens in the
 * browser, where the location is.
 */
export default async function Page() {
  // One open visit at a time. Somebody who arrives here with one already running
  // has almost certainly forgotten to check out, and the useful thing is to put
  // them in front of the visit they left open rather than to explain the rule.
  const openId = await openVisitId();
  if (openId) redirect(`/visit/visits/${openId}`);

  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select(NEARBY_CUSTOMER_COLUMNS)
    .eq("status", "active")
    .order("shop_name");

  const customers = (data ?? []) as unknown as NearbyCustomer[];

  if (customers.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-muted">
          There are no shops you can visit yet. Ask an administrator which
          customers your account should carry.
        </p>
      </Card>
    );
  }

  return <CheckInList customers={customers} />;
}
