import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { Commune, District, Province } from "@/lib/customers";
import { CustomerForm } from "../CustomerForm";

export const metadata = { title: "New customer" };

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const supabase = await createClient();

  const [provinces, districts, communes, mine] = await Promise.all([
    supabase.from("geo_provinces").select("code, name_en, name_km").order("sort_order"),
    supabase.from("geo_districts").select("code, province_code, name_en, name_km").order("name_en"),
    supabase.from("geo_communes").select("code, district_code, name_en, name_km").order("name_en"),
    getMyPermissions(),
  ]);

  // The form would show, and then the insert would be refused by the policy.
  // Turning it away here says the same thing sooner and honestly.
  if (!can(mine, "customer", "add")) redirect(`/${view}/customers`);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/${view}/customers`}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
        >
          <Icon name="chevron" className="size-4 rotate-180" />
          All customers
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">New customer</h1>
      </div>

      <CustomerForm
        customer={null}
        contacts={[]}
        provinces={(provinces.data ?? []) as Province[]}
        districts={(districts.data ?? []) as District[]}
        communes={(communes.data ?? []) as Commune[]}
        canSetCredit={can(mine, "customer_credit", "edit")}
        viewKey={view}
      />
    </div>
  );
}
