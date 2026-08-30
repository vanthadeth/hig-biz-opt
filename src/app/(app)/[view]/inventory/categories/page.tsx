import Link from "next/link";
import { Icon } from "@/components/Icon";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_COLUMNS, type Category } from "@/lib/inventory";
import { CategoryManager } from "./CategoryManager";

export const metadata = { title: "Categories" };

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const supabase = await createClient();

  const [categories, mine] = await Promise.all([
    supabase.from("item_categories").select(CATEGORY_COLUMNS).order("sort_order"),
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
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Categories</h1>
        <p className="mt-1 text-sm text-muted">
          One level of sub-category. Items are filed under either level and
          listed under the top one.
        </p>
      </div>

      <CategoryManager
        categories={(categories.data ?? []) as Category[]}
        canEdit={can(mine, "inventory", "edit") || can(mine, "inventory", "add")}
        canDelete={can(mine, "inventory", "delete")}
      />
    </div>
  );
}
