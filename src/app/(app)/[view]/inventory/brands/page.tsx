import Link from "next/link";
import { Icon } from "@/components/Icon";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { BRAND_COLUMNS, type Brand } from "@/lib/inventory";
import { BrandManager } from "./BrandManager";

export const metadata = { title: "Brands" };

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const supabase = await createClient();

  const [brands, mine] = await Promise.all([
    supabase.from("brands").select(BRAND_COLUMNS).order("sort_order").order("name"),
    getMyPermissions(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/${view}/inventory`}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
        >
          <Icon name="chevron" className="size-4 rotate-180" />
          Inventory
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Brands</h1>
        <p className="mt-1 text-sm text-muted">
          A brand is optional on an item — plenty of stock is unbranded.
        </p>
      </div>

      <BrandManager
        brands={(brands.data ?? []) as Brand[]}
        canEdit={can(mine, "inventory", "edit") || can(mine, "inventory", "add")}
        canDelete={can(mine, "inventory", "delete")}
      />
    </div>
  );
}
