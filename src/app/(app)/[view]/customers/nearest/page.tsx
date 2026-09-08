import { PageTitle } from "@/components/PageTitle";
import { createClient } from "@/lib/supabase/server";
import { CART_CUSTOMER_COLUMNS, type CartCustomer } from "@/lib/catalog";
import { NearestCustomer } from "./NearestCustomer";

/**
 * Which shop am I standing outside.
 *
 * The list is fetched on the server — the policy decides which shops this
 * person may see — and the answering happens in the browser, because only the
 * browser knows where the phone is.
 *
 * The last-visit date comes from `visits`, not from `customers.last_visit_date`
 * — that column has never had a trigger to fill it in, so it is always null.
 * Reading `visits` directly also means this only ever shows what the viewer's
 * own `visit:view` scope already lets them see: a rep sees their own calls, a
 * supervisor their line's, without this screen having to ask the question
 * itself.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  const supabase = await createClient();

  const [customers, visits] = await Promise.all([
    supabase
      .from("customers")
      .select(CART_CUSTOMER_COLUMNS)
      .eq("status", "active")
      .order("shop_name"),
    // Newest first, so keeping only the first row seen per customer below
    // keeps the most recent one. Cancelled calls do not count as a visit --
    // the shop was not really seen. Bounded rather than the whole table: a
    // customer whose only calls fall off the end of this reads as never
    // visited, which is the same answer "long enough ago not to matter" would
    // give anyway.
    supabase
      .from("visits")
      .select("customer_id, checked_in_at")
      .not("customer_id", "is", null)
      .is("cancelled_at", null)
      .order("checked_in_at", { ascending: false })
      .limit(3000),
  ]);

  const lastVisits = new Map<string, string>();
  for (const row of (visits.data ?? []) as { customer_id: string; checked_in_at: string }[]) {
    if (!lastVisits.has(row.customer_id)) lastVisits.set(row.customer_id, row.checked_in_at);
  }

  return (
    <div className="space-y-4">
      <PageTitle />
      <NearestCustomer
        viewKey={view}
        customers={(customers.data ?? []) as CartCustomer[]}
        lastVisits={[...lastVisits]}
        now={new Date().toISOString()}
      />
    </div>
  );
}
