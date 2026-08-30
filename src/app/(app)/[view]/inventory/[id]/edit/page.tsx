import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  BRAND_COLUMNS,
  CATEGORY_COLUMNS,
  ITEM_COLUMNS,
  VARIANT_COLUMNS,
  type Brand,
  type Category,
  type Item,
  type Variant,
} from "@/lib/inventory";
import { ItemForm } from "../../ItemForm";

export const metadata = { title: "Edit item" };

export default async function Page({
  params,
}: {
  params: Promise<{ view: string; id: string }>;
}) {
  const { view, id } = await params;
  const supabase = await createClient();

  const [itemResult, variantsResult, categories, brands, mine] = await Promise.all([
    supabase.from("items").select(ITEM_COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("item_variants")
      .select(VARIANT_COLUMNS)
      .eq("item_id", id)
      .order("sort_order"),
    supabase.from("item_categories").select(CATEGORY_COLUMNS).order("sort_order"),
    supabase.from("brands").select(BRAND_COLUMNS).eq("active", true).order("sort_order"),
    getMyPermissions(),
  ]);

  if (!itemResult.data) notFound();

  // The form would show, and then every save would be refused silently by the
  // policy. Turning it away here says the same thing sooner and honestly.
  if (!can(mine, "inventory", "edit")) redirect(`/${view}/inventory/${id}`);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/${view}/inventory/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
        >
          <Icon name="chevron" className="size-4 rotate-180" />
          Back to the item
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Edit item</h1>
      </div>

      <ItemForm
        item={itemResult.data as unknown as Item}
        variants={(variantsResult.data ?? []) as unknown as Variant[]}
        categories={(categories.data ?? []) as Category[]}
        brands={(brands.data ?? []) as Brand[]}
        canDelete={can(mine, "inventory", "delete")}
        viewKey={view}
      />
    </div>
  );
}
