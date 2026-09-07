import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  CONTACT_COLUMNS,
  CUSTOMER_COLUMNS,
  type Customer,
  type CustomerContact,
  type Province,
} from "@/lib/customers";
import { CustomerForm } from "../../CustomerForm";

export const metadata = { title: "Edit customer" };

export default async function Page({
  params,
}: {
  params: Promise<{ view: string; id: string }>;
}) {
  const { view, id } = await params;
  const supabase = await createClient();

  const [record, contacts, provinces, mine] = await Promise.all([
    supabase.from("customers").select(CUSTOMER_COLUMNS).eq("id", id).maybeSingle(),
    // Active only: a retired contact is not something the form should offer to
    // edit, and saving one back would quietly reinstate them.
    supabase
      .from("customer_contacts")
      .select(CONTACT_COLUMNS)
      .eq("customer_id", id)
      .eq("active", true)
      .order("is_primary", { ascending: false })
      .order("sort_order"),
    supabase.from("geo_provinces").select("code, name, name_alt").order("sort_order"),
    getMyPermissions(),
  ]);

  if (!record.data) notFound();
  if (!can(mine, "customer", "edit")) redirect(`/${view}/customers/${id}`);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/${view}/customers/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
        >
          <Icon name="chevron" className="size-4 rotate-180" />
          Back to the customer
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Edit customer</h1>
      </div>

      <CustomerForm
        customer={record.data as unknown as Customer}
        contacts={(contacts.data ?? []) as unknown as CustomerContact[]}
        provinces={(provinces.data ?? []) as Province[]}
        canSetCredit={can(mine, "customer_credit", "edit")}
        viewKey={view}
      />
    </div>
  );
}
