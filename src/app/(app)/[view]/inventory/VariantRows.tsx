"use client";

import { Icon } from "@/components/Icon";
import { Field } from "@/components/ui/Field";
import { haptic } from "@/lib/haptics";
import { variantLabel } from "@/lib/inventory";
import { ImageField } from "./ImageField";

/**
 * One priced version of an item, as the form holds it.
 *
 * `key` is a client-side handle, not a database id: a row that has never been
 * saved has no id, and React still needs something stable to keep the inputs
 * attached to the right row while others are added and removed above it.
 */
export type VariantDraft = {
  key: string;
  id: string | null;
  barcode: string;
  property_name: string;
  property_value: string;
  photo_path: string | null;
  file: File | null;
  active: boolean;
};

export function emptyVariant(): VariantDraft {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    id: null,
    barcode: "",
    property_name: "",
    property_value: "",
    photo_path: null,
    file: null,
    active: true,
  };
}

/** What is wrong with a row, in the words the person filling it in needs. */
export function variantProblem(variant: VariantDraft): string | null {
  const name = variant.property_name.trim();
  const value = variant.property_value.trim();

  if (name !== "" && value === "") return "This property has no value yet.";
  if (value !== "" && name === "") return "This value has no property name yet.";
  return null;
}

/**
 * A barcode used twice across the form.
 *
 * The barcode is unique across the whole catalogue in the database, so a clash
 * with another item is caught there. This catches the half the database cannot
 * see until it is too late to be useful: the same barcode typed into two rows of
 * the form somebody is looking at.
 */
export function duplicateCodes(variants: VariantDraft[]): Set<string> {
  const seen = new Map<string, number>();
  const clashing = new Set<string>();

  for (const variant of variants) {
    const value = variant.barcode.trim().toLowerCase();
    if (value === "") continue;
    const count = (seen.get(value) ?? 0) + 1;
    seen.set(value, count);
    if (count > 1) clashing.add(value);
  }

  return clashing;
}

/**
 * The forms an item comes in — its sizes, colours and packs.
 *
 * A variant describes rather than prices: the price and the code belong to the
 * item, so what lives here is the property that tells one variant from another,
 * the picture of it, and the barcode. The barcode is on the variant because it
 * is assigned to the physical package, so a 500 ml bottle and a 1.5 L one
 * genuinely carry different ones.
 */
export function VariantRows({
  variants,
  itemId,
  disabled,
  onChange,
}: {
  variants: VariantDraft[];
  /** Null while the item is being created: pictures are filed under it later. */
  itemId: string | null;
  disabled: boolean;
  onChange: (next: VariantDraft[]) => void;
}) {
  const clashing = duplicateCodes(variants);

  function patch(key: string, changes: Partial<VariantDraft>) {
    onChange(variants.map((v) => (v.key === key ? { ...v, ...changes } : v)));
  }

  function remove(key: string) {
    haptic("tap");
    onChange(variants.filter((v) => v.key !== key));
  }

  return (
    <div className="space-y-3">
      {variants.map((variant, index) => {
        const problem = variantProblem(variant);
        const barcodeClash = clashing.has(variant.barcode.trim().toLowerCase());
        return (
          <div
            key={variant.key}
            className="rounded-xl border border-line p-3"
            data-variant-row
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {variantLabel({
                  property_name: variant.property_name.trim() || null,
                  property_value: variant.property_value.trim() || null,
                  barcode: variant.barcode.trim() || null,
                })}
              </span>
              {!disabled && variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(variant.key)}
                  aria-label={`Remove variant ${index + 1}`}
                  className="pressable flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:text-danger"
                >
                  <Icon name="trash" className="size-4" />
                  Remove
                </button>
              )}
            </div>

            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field
                label={`Property ${index + 1}`}
                optional
                value={variant.property_name}
                onChange={(v) => patch(variant.key, { property_name: v })}
                placeholder="Size"
                disabled={disabled}
              />
              <Field
                label={`Value ${index + 1}`}
                optional
                value={variant.property_value}
                onChange={(v) => patch(variant.key, { property_value: v })}
                placeholder="500 ml"
                disabled={disabled}
              />
              <div className="sm:col-span-2">
                <Field
                  label={`Barcode ${index + 1}`}
                  optional
                  inputMode="numeric"
                  value={variant.barcode}
                  onChange={(v) => patch(variant.key, { barcode: v })}
                  placeholder="8850123456789"
                  hint={
                    index === 0
                      ? "On the package, so each size or colour has its own."
                      : undefined
                  }
                  error={barcodeClash ? "Used twice on this item." : null}
                  disabled={disabled}
                />
              </div>
              <div className="sm:col-span-2">
                <ImageField
                  label={`Picture ${index + 1}`}
                  alt={variant.property_value || "Item"}
                  path={variant.photo_path}
                  file={variant.file}
                  disabled={disabled || itemId === null}
                  onChange={(file) => patch(variant.key, { file })}
                />
                {itemId === null && (
                  <p className="mt-1 text-xs text-muted">
                    Pictures can be added once the item exists.
                  </p>
                )}
              </div>
            </div>

            {problem && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {problem}
              </p>
            )}
          </div>
        );
      })}

      {!disabled && (
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            onChange([...variants, emptyVariant()]);
          }}
          className="pressable flex min-h-10 items-center gap-1.5 rounded-xl border border-dashed border-brand/50 px-3 text-sm font-medium text-brand"
        >
          <Icon name="plus" className="size-4" />
          Add another variant
        </button>
      )}
    </div>
  );
}
