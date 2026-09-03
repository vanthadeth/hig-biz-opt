"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Field, SelectField } from "@/components/ui/Field";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  categoryOptions,
  parsePrice,
  type Brand,
  type Category,
  type Item,
  type Variant,
} from "@/lib/inventory";
import { uploadInventoryImage } from "./ImageField";
import {
  duplicateCodes,
  VariantRows,
  variantProblem,
  type VariantDraft,
} from "./VariantRows";

type Draft = {
  code: string;
  price_usd: string;
  price_khr: string;
  name_en: string;
  name_km: string;
  description: string;
  category_id: string;
  brand_id: string;
};

function draftFrom(item: Item | null): Draft {
  return {
    code: item?.code ?? "",
    // Straight to a string, not through a formatter: this is the number to
    // edit, not the number to read, and "$0.50" is not something to type into.
    price_usd: item?.price_usd == null ? "" : String(item.price_usd),
    price_khr: item?.price_khr == null ? "" : String(item.price_khr),
    name_en: item?.name_en ?? "",
    name_km: item?.name_km ?? "",
    description: item?.description ?? "",
    category_id: item?.category_id ?? "",
    brand_id: item?.brand_id ?? "",
  };
}

/**
 * No blank row is seeded for an item that has none. Most stock is sold in one
 * form, and an empty variant waiting to be filled in is one more thing to
 * notice and delete on every such item.
 */
function variantsFrom(rows: Variant[]): VariantDraft[] {
  return rows.map((row) => ({
    key: row.id,
    id: row.id,
    barcode: row.barcode ?? "",
    property_name: row.property_name ?? "",
    property_value: row.property_value ?? "",
    photo_path: row.photo_path,
    file: null,
    active: row.active,
  }));
}

const blank = (value: string) => (value.trim() === "" ? null : value.trim());

/**
 * An item and its prices, on one screen.
 *
 * The variants are saved alongside the item rather than on a page of their
 * own, because a price nobody has entered yet is the commonest thing wrong
 * with a new catalogue entry, and a second screen is where that gets forgotten.
 */
export function ItemForm({
  item,
  variants: saved,
  categories,
  brands,
  canDelete,
  viewKey,
}: {
  item: Item | null;
  variants: Variant[];
  categories: Category[];
  brands: Brand[];
  canDelete: boolean;
  viewKey: string;
}) {
  const router = useRouter();
  const creating = item === null;

  const [draft, setDraft] = useState<Draft>(() => draftFrom(item));
  const [variants, setVariants] = useState<VariantDraft[]>(() => variantsFrom(saved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDone(false);
  };

  const nameMissing = draft.name_en.trim() === "";
  const badVariant = variants.some((v) => variantProblem(v) !== null);
  // A barcode repeated across two rows would be refused by the unique index at
  // the end of a long form. Catching it here says so while it is still typed.
  const clashingCodes = duplicateCodes(variants).size > 0;
  const badPrice =
    parsePrice(draft.price_usd) === undefined || parsePrice(draft.price_khr) === undefined;
  const blocked = nameMissing || badVariant || clashingCodes || badPrice;

  function toRow() {
    return {
      code: blank(draft.code),
      price_usd: parsePrice(draft.price_usd) ?? null,
      price_khr: parsePrice(draft.price_khr) ?? null,
      name_en: draft.name_en.trim(),
      name_km: blank(draft.name_km),
      description: blank(draft.description),
      category_id: blank(draft.category_id),
      brand_id: blank(draft.brand_id),
      // No `active` here. A new item is active by the column default, and an
      // existing one keeps whatever the status card set — this form has no
      // business changing it in a batch of corrections.
    };
  }

  /** Writes the variant rows for an item that is known to exist. */
  async function saveVariants(itemId: string) {
    const supabase = createClient();

    // Anything the person removed from the form goes from the table too;
    // leaving it would leave a price for an option nobody can see.
    const keptIds = new Set(variants.map((v) => v.id).filter(Boolean) as string[]);
    const dropped = saved.filter((row) => !keptIds.has(row.id)).map((row) => row.id);
    if (dropped.length > 0) {
      const { error } = await supabase.from("item_variants").delete().in("id", dropped);
      if (error) throw error;
    }

    for (const [index, variant] of variants.entries()) {
      const photoPath = variant.file
        ? await uploadInventoryImage(`items/${itemId}`, variant.file)
        : variant.photo_path;

      const row = {
        item_id: itemId,
        barcode: blank(variant.barcode),
        property_name: blank(variant.property_name),
        property_value: blank(variant.property_value),
        photo_path: photoPath,
        active: variant.active,
        sort_order: index + 1,
      };

      if (variant.id) {
        // `.select()` because an update the policy refuses matches no rows and
        // raises nothing at all.
        const { data, error } = await supabase
          .from("item_variants")
          .update(row)
          .eq("id", variant.id)
          .select("id");
        if (error) throw error;
        if (!data?.length) {
          throw new Error("Those variants could not be saved. You may not have permission.");
        }
      } else {
        const { error } = await supabase.from("item_variants").insert(row);
        if (error) throw error;
      }
    }
  }

  async function save() {
    if (blocked) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();

    try {
      if (creating) {
        const { data, error } = await supabase
          .from("items")
          .insert(toRow())
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("The item was not created.");

        await saveVariants(data.id);
        haptic("success");
        router.replace(`/${viewKey}/inventory/${data.id}`);
        router.refresh();
        return;
      }

      const { data, error } = await supabase
        .from("items")
        .update(toRow())
        .eq("id", item.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That item could not be saved. You may not have permission.");
      }

      await saveVariants(item.id);
      haptic("success");
      setDone(true);
      router.refresh();
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The item could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (creating) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await createClient()
        .from("items")
        .delete()
        .eq("id", item.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That item could not be removed. You may not have permission.");
      }
      haptic("success");
      router.replace(`/${viewKey}/inventory`);
      router.refresh();
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The item could not be removed.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionHeader title="Item" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Name (English)"
            value={draft.name_en}
            onChange={(v) => set("name_en", v)}
            placeholder="Drinking Water"
            error={nameMissing && draft.name_en !== "" ? "A name is needed." : null}
          />
          <Field
            label="Name (Khmer)"
            optional
            value={draft.name_km}
            onChange={(v) => set("name_km", v)}
            placeholder="ទឹកសុទ្ធ"
          />
          <Field
            label="Item code"
            optional
            value={draft.code}
            onChange={(v) => set("code", v)}
            placeholder="HIG-001"
            hint="Your own reference. Unique across the catalogue when it is set."
          />
          <Field
            label="Price USD"
            optional
            inputMode="numeric"
            value={draft.price_usd}
            onChange={(v) => set("price_usd", v)}
            placeholder="0.50"
            error={parsePrice(draft.price_usd) === undefined ? "That is not a price." : null}
          />
          <Field
            label="Price KHR"
            optional
            inputMode="numeric"
            value={draft.price_khr}
            onChange={(v) => set("price_khr", v)}
            placeholder="2000"
            error={parsePrice(draft.price_khr) === undefined ? "That is not a price." : null}
          />
          <div className="sm:col-span-2">
            <Field
              label="Description"
              optional
              value={draft.description}
              onChange={(v) => set("description", v)}
              placeholder="Anything worth knowing about it"
            />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="Classification" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Category"
            optional
            value={draft.category_id}
            onChange={(v) => set("category_id", v)}
            options={categoryOptions(categories)}
            placeholder="No category"
          />
          <SelectField
            label="Brand"
            optional
            value={draft.brand_id}
            onChange={(v) => set("brand_id", v)}
            options={brands.map((brand) => ({ value: brand.id, label: brand.name }))}
            placeholder="No brand"
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          Missing one?{" "}
          <Link href={`/${viewKey}/inventory/categories`} className="text-brand underline">
            Manage categories
          </Link>{" "}
          or{" "}
          <Link href={`/${viewKey}/inventory/brands`} className="text-brand underline">
            brands
          </Link>
          .
        </p>

        <p className="mt-3 text-xs text-muted">
          {creating
            ? "A new item starts active. Taking one out of the catalogue is done from the record, where it asks first."
            : "Whether an item is active is changed from the record, where it asks first."}
        </p>
      </Card>

      <Card className="p-4">
        <SectionHeader title="Variants" />
        <p className="mt-1 text-xs text-muted">
          Only if this item comes in more than one form — a size, a colour, a
          pack — each with its own barcode. The price and the code above cover
          the item as a whole, and its pictures live on the record.
        </p>
        <div className="mt-3">
          <VariantRows
            variants={variants}
            itemId={item?.id ?? null}
            disabled={busy}
            onChange={(next) => {
              setVariants(next);
              setDone(false);
            }}
          />
        </div>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="sticky bottom-24 z-30 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-pop)] md:bottom-4">
        <span className="flex-1 text-sm text-muted" role="status">
          {done
            ? "Saved."
            : nameMissing
              ? "An English name is needed."
              : badVariant
                ? "Check the variants below."
                : clashingCodes
                  ? "A barcode is used twice."
                  : badPrice
                    ? "Check the price."
                : creating
                  ? "New item"
                  : "Editing"}
        </span>

        {!creating && canDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="pressable min-h-10 rounded-xl border border-line px-3 text-sm font-medium text-danger disabled:opacity-60"
          >
            Remove
          </button>
        )}

        <button
          type="button"
          onClick={save}
          disabled={busy || blocked}
          className="pressable min-h-10 rounded-xl bg-brand px-4 text-sm font-medium text-brand-fg disabled:opacity-60"
        >
          {busy ? "Saving…" : creating ? "Create item" : "Save"}
        </button>
      </div>
    </div>
  );
}
