import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  BRAND_COLUMNS,
  CATEGORY_COLUMNS,
  type Brand,
  type Category,
} from "@/lib/inventory";
import { ItemForm } from "../ItemForm";

export const metadata = { title: "New item" };

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const supabase = await createClient();

  const [categories, brands, mine] = await Promise.all([
    supabase.from("item_categories").select(CATEGORY_COLUMNS).order("sort_order"),
    supabase.from("brands").select(BRAND_COLUMNS).eq("active", true).order("sort_order"),
    getMyPermissions(),
  ]);

  if (!can(mine, "inventory", "add")) redirect(`/${view}/inventory`);

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
        <h1 className="mt-1 text-xl font-semibold tracking-tight">New item</h1>
      </div>

      <ItemForm
        item={null}
        variants={[]}
        categories={(categories.data ?? []) as Category[]}
        brands={(brands.data ?? []) as Brand[]}
        canDelete={false}
        viewKey={view}
      />
    </div>
  );
}
