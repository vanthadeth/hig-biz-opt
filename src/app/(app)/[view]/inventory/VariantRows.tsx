"use client";

import { Icon } from "@/components/Icon";
import { Field } from "@/components/ui/Field";
import { haptic } from "@/lib/haptics";
import { parsePrice, variantLabel } from "@/lib/inventory";
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
  attribute_name: string;
  attribute_value: string;
  price_usd: string;
  price_khr: string;
  photo_path: string | null;
  file: File | null;
  active: boolean;
};

export function emptyVariant(): VariantDraft {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    id: null,
    attribute_name: "",
    attribute_value: "",
    price_usd: "",
    price_khr: "",
    photo_path: null,
    file: null,
    active: true,
  };
}

/** What is wrong with a row, in the words the person filling it in needs. */
export function variantProblem(variant: VariantDraft): string | null {
  const name = variant.attribute_name.trim();
  const value = variant.attribute_value.trim();

  if (name !== "" && value === "") return "This attribute has no value yet.";
  if (value !== "" && name === "") return "This value has no attribute name yet.";
  if (parsePrice(variant.price_usd) === undefined) return "That is not a dollar price.";
  if (parsePrice(variant.price_khr) === undefined) return "That is not a riel price.";
  return null;
}

/**
 * The prices, one row per version of the item.
 *
 * Price and picture sit here rather than on the item because a 500 ml bottle
 * and a 1.5 L bottle are different money and a different photograph. An item
 * with nothing to vary keeps exactly one row with the attribute boxes empty,
 * which is where its single price lives — so nothing in the system has to ask
 * whether an item is "simple" or "variable".
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
        return (
          <div
            key={variant.key}
            className="rounded-xl border border-line p-3"
            data-variant-row
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {variantLabel({
                  attribute_name: variant.attribute_name.trim() || null,
                  attribute_value: variant.attribute_value.trim() || null,
                })}
              </span>
              {!disabled && variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(variant.key)}
                  aria-label={`Remove option ${index + 1}`}
                  className="pressable flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:text-danger"
                >
                  <Icon name="trash" className="size-4" />
                  Remove
                </button>
              )}
            </div>

            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field
                label={`Attribute ${index + 1}`}
                optional
                value={variant.attribute_name}
                onChange={(v) => patch(variant.key, { attribute_name: v })}
                placeholder="Size"
                disabled={disabled}
              />
              <Field
                label={`Value ${index + 1}`}
                optional
                value={variant.attribute_value}
                onChange={(v) => patch(variant.key, { attribute_value: v })}
                placeholder="500 ml"
                disabled={disabled}
              />
              <Field
                label={`Price USD ${index + 1}`}
                optional
                inputMode="numeric"
                value={variant.price_usd}
                onChange={(v) => patch(variant.key, { price_usd: v })}
                placeholder="0.50"
                disabled={disabled}
              />
              <Field
                label={`Price KHR ${index + 1}`}
                optional
                inputMode="numeric"
                value={variant.price_khr}
                onChange={(v) => patch(variant.key, { price_khr: v })}
                placeholder="2000"
                disabled={disabled}
              />
              <div className="sm:col-span-2">
                <ImageField
                  label={`Picture ${index + 1}`}
                  alt={variant.attribute_value || "Item"}
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
          Add another option
        </button>
      )}
    </div>
  );
}
