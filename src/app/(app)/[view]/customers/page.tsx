import { PageTitle } from "@/components/PageTitle";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { DIRECTORY_COLUMNS, type DirectoryCustomer } from "@/lib/customers";
import { CustomerList } from "./CustomerList";

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const supabase = await createClient();

  // The directory view rather than the table: the list needs a resolved area, a
  // primary contact and a primary picture per row, and doing those joins here
  // costs one request instead of five. Row level security still decides who
  // appears, since the view is security_invoker — and on this module that is
  // scoped by the account's owner.
  const [directory, mine] = await Promise.all([
    supabase.from("customer_directory").select(DIRECTORY_COLUMNS).order("shop_name"),
    getMyPermissions(),
  ]);

  return (
    <div className="space-y-5">
      <PageTitle />
      <CustomerList
        customers={(directory.data ?? []) as DirectoryCustomer[]}
        canAdd={can(mine, "customer", "add")}
        viewKey={view}
      />
    </div>
  );
}
