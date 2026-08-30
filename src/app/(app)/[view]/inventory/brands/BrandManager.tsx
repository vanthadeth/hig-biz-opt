"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { StoredPhoto } from "@/components/ui/StoredPhoto";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { BRAND_COLUMNS, INVENTORY_BUCKET, type Brand } from "@/lib/inventory";
import { ImageField, uploadInventoryImage } from "../ImageField";

type Draft = {
  id: string | null;
  name: string;
  description: string;
  logo_path: string | null;
  active: boolean;
};

function draftFrom(brand: Brand | null): Draft {
  return {
    id: brand?.id ?? null,
    name: brand?.name ?? "",
    description: brand?.description ?? "",
    logo_path: brand?.logo_path ?? null,
    active: brand?.active ?? true,
  };
}

/**
 * The brand list.
 *
 * A brand is optional on an item — plenty of stock is unbranded — so this is a
 * short reference list rather than a required step, and it is reachable from
 * the item form for the moment somebody needs one that is not there yet.
 */
export function BrandManager({
  brands: initial,
  canEdit,
  canDelete,
}: {
  brands: Brand[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [brands, setBrands] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(brand: Brand | null) {
    haptic("tap");
    setDraft(draftFrom(brand));
    setFile(null);
    setError(null);
  }

  function close() {
    setDraft(null);
    setFile(null);
    setError(null);
  }

  const trimmed = draft?.name.trim() ?? "";
  const duplicate = brands.some(
    (b) => b.id !== draft?.id && b.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const valid = trimmed !== "" && !duplicate;

  async function save() {
    if (!draft || !valid) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();

    try {
      const row = {
        name: trimmed,
        description: draft.description.trim() === "" ? null : draft.description.trim(),
        active: draft.active,
      };

      if (draft.id === null) {
        // The logo needs an id to be filed under, and the id comes back from
        // the insert, so the row is created first and dressed afterwards.
        const { data, error } = await supabase
          .from("brands")
          .insert(row)
          .select(BRAND_COLUMNS)
          .single();
        if (error || !data) throw error ?? new Error("The brand was not created.");

        let created = data as Brand;
        if (file) {
          const path = await uploadInventoryImage(`brands/${created.id}`, file);
          const { data: withLogo } = await supabase
            .from("brands")
            .update({ logo_path: path })
            .eq("id", created.id)
            .select(BRAND_COLUMNS)
            .single();
          if (withLogo) created = withLogo as Brand;
        }

        setBrands((list) => [...list, created]);
      } else {
        const logoPath = file
          ? await uploadInventoryImage(`brands/${draft.id}`, file)
          : draft.logo_path;

        // `.select()` because an update the policy refuses matches no rows and
        // raises nothing at all.
        const { data, error } = await supabase
          .from("brands")
          .update({ ...row, logo_path: logoPath })
          .eq("id", draft.id)
          .select(BRAND_COLUMNS);
        if (error) throw error;
        if (!data?.length) {
          throw new Error("That brand could not be saved. You may not have permission.");
        }

        const updated = data[0] as Brand;
        setBrands((list) => list.map((b) => (b.id === updated.id ? updated : b)));
      }

      haptic("success");
      close();
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The brand could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    setBusy(true);
    setError(null);

    try {
      const { data, error } = await createClient()
        .from("brands")
        .delete()
        .eq("id", draft.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That brand could not be removed. You may not have permission.");
      }

      const removed = draft.id;
      setBrands((list) => list.filter((b) => b.id !== removed));
      haptic("success");
      close();
    } catch (e) {
      haptic("error");
      setError(
        e instanceof Error && /violates foreign key/i.test(e.message)
          ? "Items still carry this brand. Change them first, or make it inactive instead."
          : e instanceof Error
            ? e.message
            : "The brand could not be removed.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <button
          type="button"
          onClick={() => open(null)}
          className="pressable flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-medium text-brand-fg"
        >
          <Icon name="plus" className="size-4" />
          New brand
        </button>
      )}

      {brands.length === 0 ? (
        <p className="text-sm text-muted">No brands yet.</p>
      ) : (
        <Card className="divide-y divide-line p-0">
          {brands.map((brand) => {
            const body = (
              <>
                <StoredPhoto
                  name={brand.name}
                  path={brand.logo_path}
                  bucket={INVENTORY_BUCKET}
                  fallback={<Icon name="bolt" className="size-4" />}
                  className="size-10 rounded-lg"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{brand.name}</span>
                  {brand.description && (
                    <span className="block truncate text-xs text-muted">
                      {brand.description}
                    </span>
                  )}
                </span>
                {!brand.active && <Chip tone="warn">Inactive</Chip>}
              </>
            );

            return canEdit ? (
              <button
                key={brand.id}
                type="button"
                onClick={() => open(brand)}
                className="flex min-h-14 w-full items-center gap-3 px-3 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-subtle"
              >
                {body}
                <Icon name="pencil" className="size-4 shrink-0 text-muted" />
              </button>
            ) : (
              <div key={brand.id} className="flex min-h-14 items-center gap-3 px-3">
                {body}
              </div>
            );
          })}
        </Card>
      )}

      <Sheet
        open={draft !== null}
        onClose={close}
        title={draft?.id ? "Edit brand" : "New brand"}
      >
        {draft && (
          <div className="space-y-4 px-3 pb-4 pt-1">
            <Field
              label="Name"
              value={draft.name}
              onChange={(v) => setDraft({ ...draft, name: v })}
              placeholder="Angkor"
              error={duplicate ? `A brand called “${trimmed}” already exists.` : null}
            />

            <Field
              label="Description"
              optional
              value={draft.description}
              onChange={(v) => setDraft({ ...draft, description: v })}
              placeholder="Who makes it, or anything worth noting"
            />

            <ImageField
              label="Logo"
              alt={draft.name || "Brand"}
              path={draft.logo_path}
              file={file}
              onChange={setFile}
              disabled={busy}
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                className="size-4 accent-[var(--brand)]"
              />
              Active
            </label>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium text-muted disabled:opacity-60"
              >
                Cancel
              </button>
              {draft.id && canDelete && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="pressable min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-danger disabled:opacity-60"
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={save}
                disabled={!valid || busy}
                className="pressable min-h-11 flex-1 rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
              >
                {busy ? "Saving…" : draft.id ? "Save" : "Create"}
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
