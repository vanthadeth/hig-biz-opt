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
  formatKhr,
  formatUsd,
  INVENTORY_BUCKET,
  ITEM_COLUMNS,
  variantLabel,
  VARIANT_COLUMNS,
  type Item,
  type Variant,
} from "@/lib/inventory";

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
          .select("name, parent_id")
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
        .select("name")
        .eq("id", category.data.parent_id as string)
        .maybeSingle()
    : { data: null };

  const path = categoryPath({
    category_name: (category.data?.name as string) ?? null,
    category_parent_name: (parent.data?.name as string) ?? null,
  });

  const priced = variants.filter((v) => v.active);
  const summary = bothPrices({
    min_price_usd: min(priced.map((v) => v.price_usd)),
    max_price_usd: max(priced.map((v) => v.price_usd)),
    min_price_khr: min(priced.map((v) => v.price_khr)),
    max_price_khr: max(priced.map((v) => v.price_khr)),
  });

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
            <p className="mt-1 text-sm">{summary}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {!item.active && <Chip tone="warn">Inactive</Chip>}
              {brand.data?.name && <Chip tone="brand">{brand.data.name as string}</Chip>}
              {path && <Chip>{path}</Chip>}
              {item.code && <Chip>{item.code}</Chip>}
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
          title="Prices"
          caption={`${variants.length} option${variants.length === 1 ? "" : "s"}`}
        />

        {variants.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No price has been entered for this item yet.
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
                  {!variant.active && (
                    <span className="text-xs text-muted">Not for sale</span>
                  )}
                </span>
                <span className="shrink-0 text-right text-sm">
                  <span className="block">{formatUsd(variant.price_usd) ?? "—"}</span>
                  <span className="block text-xs text-muted">
                    {formatKhr(variant.price_khr) ?? "—"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// The catalogue view does this in SQL for the list; one record is not worth a
// second round trip to ask the same question.
function min(values: (number | null)[]): number | null {
  const set = values.filter((v): v is number => v !== null);
  return set.length ? Math.min(...set) : null;
}

function max(values: (number | null)[]): number | null {
  const set = values.filter((v): v is number => v !== null);
  return set.length ? Math.max(...set) : null;
}
