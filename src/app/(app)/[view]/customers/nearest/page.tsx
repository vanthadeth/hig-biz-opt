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
 */
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("customers")
    .select(CART_CUSTOMER_COLUMNS)
    .eq("status", "active")
    .order("shop_name");

  return (
    <div className="space-y-4">
      <PageTitle />
      <NearestCustomer
        viewKey={view}
        customers={(data ?? []) as CartCustomer[]}
      />
    </div>
  );
}
