import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CART_CUSTOMER_COLUMNS, type CartCustomer } from "@/lib/catalog";
import {
  OPTION_COLUMNS,
  VISIT_DETAIL_COLUMNS,
  type VisitOption,
  type VisitRow,
} from "@/lib/visits";
import { OpenVisitPage } from "./OpenVisitPage";
import { VisitRecord } from "./VisitRecord";

/**
 * One call, as it was recorded.
 *
 * Not found and not allowed look the same on purpose. The policy decides which
 * visits exist for the person asking, and telling somebody a visit exists but
 * is not theirs is telling them where a colleague was.
 *
 * Whose it is decides more than that, now that a supervisor can reach a
 * subordinate's row at all: `isOwn` is computed here, once, from the same
 * viewer id every other page on this route asks for, and handed down so
 * neither screen below has to re-derive it or trust a client-supplied claim.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ view: string; id: string }>;
}) {
  const { view, id } = await params;
  const supabase = await createClient();

  const [visit, options, customers, me] = await Promise.all([
    supabase.from("visits").select(VISIT_DETAIL_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("visit_options").select(OPTION_COLUMNS),
    supabase.from("customers").select(CART_CUSTOMER_COLUMNS).eq("status", "active"),
    supabase.auth.getUser(),
  ]);

  if (!visit.data) notFound();

  const row = visit.data as unknown as VisitRow;
  const visitOptions = (options.data ?? []) as VisitOption[];
  const now = new Date().toISOString();
  const isOwn = row.user_id === me.data.user?.id;
  const ownerName = row.user?.full_name ?? "";

  // An open visit is a different screen, not a variant of this one: it is
  // somebody standing in a shop with a job to finish, and the only thing that
  // matters is the way out being under their thumb.
  if (row.checked_out_at === null) {
    return (
      <OpenVisitPage
        viewKey={view}
        visit={row}
        options={visitOptions}
        customers={(customers.data ?? []) as CartCustomer[]}
        now={now}
        isOwn={isOwn}
        ownerName={ownerName}
      />
    );
  }

  return (
    <VisitRecord
      viewKey={view}
      visit={row}
      // Every option, not just the active ones: a visit recorded under a word
      // the business has since retired must still say what it said.
      options={visitOptions}
      now={now}
      isOwn={isOwn}
      ownerName={ownerName}
    />
  );
}
