import { notFound } from "next/navigation";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { CART_CUSTOMER_COLUMNS, type CartCustomer } from "@/lib/catalog";
import {
  OPTION_COLUMNS,
  VISIT_DETAIL_COLUMNS,
  type VisitOption,
  type VisitRow,
} from "@/lib/visits";
import { OpenVisitPage } from "@/app/(app)/[view]/visits/[id]/OpenVisitPage";
import { VisitRecord } from "@/app/(app)/[view]/visits/[id]/VisitRecord";

/**
 * The same visit record the main app's `/[view]/visits/[id]` shows — one call,
 * as it was recorded, whichever door was used to reach it. `viewKey` is fixed
 * to `"field"` rather than read from the URL, since this app has only the one
 * place a visit can be.
 */
export default async function FieldVisitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [visit, options, customers, me, permissions] = await Promise.all([
    supabase.from("visits").select(VISIT_DETAIL_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("visit_options").select(OPTION_COLUMNS),
    supabase.from("customers").select(CART_CUSTOMER_COLUMNS).eq("status", "active"),
    supabase.auth.getUser(),
    getMyPermissions(),
  ]);

  if (!visit.data) notFound();

  const row = visit.data as unknown as VisitRow;
  const visitOptions = (options.data ?? []) as VisitOption[];
  const now = new Date().toISOString();
  const isOwn = row.user_id === me.data.user?.id;
  const ownerName = row.user?.full_name ?? "";

  if (row.checked_out_at === null) {
    return (
      <OpenVisitPage
        viewKey="field"
        visit={row}
        options={visitOptions}
        customers={(customers.data ?? []) as CartCustomer[]}
        now={now}
        isOwn={isOwn}
        ownerName={ownerName}
        canAddCustomer={can(permissions, "customer", "add")}
      />
    );
  }

  return (
    <VisitRecord
      viewKey="field"
      visit={row}
      options={visitOptions}
      now={now}
      isOwn={isOwn}
      ownerName={ownerName}
    />
  );
}
