import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StoredPhoto } from "@/components/ui/StoredPhoto";
import { can, getMyPermissions } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  bothPrices,
  categoryPath,
  INVENTORY_BUCKET,
  ITEM_COLUMNS,
  variantLabel,
  VARIANT_COLUMNS,
  type Item,
  type Variant,
} from "@/lib/inventory";
import { ItemStatusControls } from "../ItemStatusControls";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("name_en")
    .eq("id", id)
    .maybeSingle();

  return { title: (data?.name_en as string) ?? "Item" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ view: string; id: string }>;
}) {
  const { view, id } = await params;
  const supabase = await createClient();

  const [itemResult, variantsResult, mine] = await Promise.all([
    supabase.from("items").select(ITEM_COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("item_variants")
      .select(VARIANT_COLUMNS)
      .eq("item_id", id)
      .order("sort_order"),
    getMyPermissions(),
  ]);

  // Row level security already hid it; a missing row and a forbidden row look
  // the same from here, which is the right answer to give either way.
  if (!itemResult.data) notFound();

  const item = itemResult.data as unknown as Item;
  const variants = (variantsResult.data ?? []) as unknown as Variant[];
  const canEdit = can(mine, "inventory", "edit");

  const [category, brand] = await Promise.all([
    item.category_id
      ? supabase
          .from("item_categories")
          .select("name_en, name_km, parent_id")
          .eq("id", item.category_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    item.brand_id
      ? supabase.from("brands").select("name").eq("id", item.brand_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const parent = category.data?.parent_id
    ? await supabase
        .from("item_categories")
        .select("name_en")
        .eq("id", category.data.parent_id as string)
        .maybeSingle()
    : { data: null };

  const path = categoryPath({
    category_name_en: (category.data?.name_en as string) ?? null,
    category_parent_name_en: (parent.data?.name_en as string) ?? null,
  });
  // The breadcrumb chip stays English so it fits; the category's own Khmer
  // name goes on its own chip beside it, where there is room for it.
  const categoryKm = (category.data?.name_km as string) ?? null;

  // One item, one price. There is nothing to take a span across any more.
  const summary = bothPrices(item);

  const lead = variants.find((v) => v.photo_path)?.photo_path ?? null;

  return (
    <div className="space-y-5">
      <Link
        href={`/${view}/inventory`}
        className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
      >
        <Icon name="chevron" className="size-4 rotate-180" />
        Inventory
      </Link>

      <Card className="p-4">
        <div className="flex items-start gap-4">
          <StoredPhoto
            name={item.name_en}
            path={lead}
            bucket={INVENTORY_BUCKET}
            fallback={<Icon name="box" className="size-7" />}
            className="size-20 rounded-2xl"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{item.name_en}</h1>
            {item.name_km && <p className="text-sm text-muted">{item.name_km}</p>}
            {item.code && <p className="text-xs text-muted">{item.code}</p>}
            <p className="mt-1 text-sm">{summary}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {!item.active && <Chip tone="warn">Inactive</Chip>}
              {brand.data?.name && <Chip tone="brand">{brand.data.name as string}</Chip>}
              {path && <Chip>{path}</Chip>}
              {categoryKm && <Chip>{categoryKm}</Chip>}
            </div>
          </div>
        </div>

        {item.description && (
          <p className="mt-3 border-t border-line pt-3 text-sm text-muted">
            {item.description}
          </p>
        )}

        {canEdit && (
          <Link
            href={`/${view}/inventory/${item.id}/edit`}
            className="pressable mt-4 flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-medium text-brand-fg"
          >
            <Icon name="pencil" className="size-4" />
            Edit item
          </Link>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader
          title="Variants"
          caption={`${variants.length} ${variants.length === 1 ? "variant" : "variants"}`}
        />

        {variants.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No variant has been entered for this item yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {variants.map((variant) => (
              <li key={variant.id} className="flex items-center gap-3 py-2">
                <StoredPhoto
                  name={variantLabel(variant)}
                  path={variant.photo_path}
                  bucket={INVENTORY_BUCKET}
                  fallback={<Icon name="box" className="size-4" />}
                  className="size-10 rounded-lg"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {variantLabel(variant)}
                  </span>
                  {/* The barcode is what a scanner reads off this particular
                      package, so it belongs on the row rather than only inside
                      the edit form. The price is the item's, and is above. */}
                  {variant.barcode && variantLabel(variant) !== variant.barcode.trim() && (
                    <span className="block truncate text-xs text-muted">
                      {variant.barcode}
                    </span>
                  )}
                  {!variant.active && (
                    <span className="text-xs text-muted">Not for sale</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ItemStatusControls
        itemId={item.id}
        name={item.name_en}
        active={item.active}
        canEdit={canEdit}
      />
    </div>
  );
}
