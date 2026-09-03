"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { StoredPhoto } from "@/components/ui/StoredPhoto";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  CUSTOMERS_BUCKET,
  PICTURE_COLUMNS,
  type CustomerPicture,
} from "@/lib/customers";

const MAX_BYTES = 5 * 1024 * 1024; // matches the bucket's own limit
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic";

/**
 * The pictures of a shop.
 *
 * Managed from the record rather than the form, because a picture needs the
 * customer to exist before it can be filed: the storage policies key on the id
 * in the object's path, so there is nowhere to put one until then.
 *
 * Each upload lands immediately rather than waiting for a save — there is no
 * other field on this card to save alongside it, and a photo that vanished
 * because somebody navigated away would be worse than one that appears at once.
 */
export function PictureManager({
  customerId,
  pictures: initial,
  canEdit,
}: {
  customerId: string;
  pictures: CustomerPicture[];
  canEdit: boolean;
}) {
  const [pictures, setPictures] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function add(file: File | null) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("That picture is over 5 MB. Please choose a smaller one.");
      return;
    }

    setBusy(true);
    setError(null);
    const supabase = createClient();

    try {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      // Under the customer id, which is what the storage policies key on.
      const path = `${customerId}/${Date.now()}.${extension}`;
      const upload = await supabase.storage
        .from(CUSTOMERS_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upload.error) throw upload.error;

      const { data, error } = await supabase
        .from("customer_pictures")
        .insert({
          customer_id: customerId,
          photo_path: path,
          description: caption.trim() === "" ? null : caption.trim(),
          // The first picture stands for the shop until somebody says otherwise.
          is_primary: pictures.length === 0,
          sort_order: pictures.length + 1,
        })
        .select(PICTURE_COLUMNS)
        .single();
      if (error || !data) throw error ?? new Error("The picture was not saved.");

      haptic("success");
      setPictures((list) => [...list, data as CustomerPicture]);
      setCaption("");
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The picture could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function makePrimary(id: string) {
    setBusy(true);
    setError(null);
    const supabase = createClient();

    try {
      // Cleared across the shop first: the partial unique index means two
      // primaries cannot both stand, even for an instant.
      const cleared = await supabase
        .from("customer_pictures")
        .update({ is_primary: false })
        .eq("customer_id", customerId)
        .eq("is_primary", true);
      if (cleared.error) throw cleared.error;

      const { data, error } = await supabase
        .from("customer_pictures")
        .update({ is_primary: true })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That could not be changed. You may not have permission.");
      }

      haptic("success");
      setPictures((list) => list.map((p) => ({ ...p, is_primary: p.id === id })));
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "That could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Retired, not deleted — 0031 took the delete away from this module.
   *
   * The file in storage stays with it. A picture that can be brought back needs
   * its object, and deleting the one thing that cannot be recreated would make
   * "soft delete" a word rather than a fact.
   *
   * `is_primary` is cleared alongside, or a retired picture would hold the slot
   * the partial unique index only allows one of.
   */
  async function retire(picture: CustomerPicture) {
    setBusy(true);
    setError(null);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("customer_pictures")
        .update({ active: false, is_primary: false })
        .eq("id", picture.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That picture could not be removed. You may not have permission.");
      }

      haptic("success");
      setPending(null);
      setPictures((list) => {
        const left = list.filter((p) => p.id !== picture.id);
        // The shop keeps a main picture as long as it has any picture at all.
        if (picture.is_primary && left.length > 0 && !left.some((p) => p.is_primary)) {
          return left.map((p, i) => (i === 0 ? { ...p, is_primary: true } : p));
        }
        return left;
      });

      // Promoting the stand-in on screen only would leave the list showing a
      // main picture the database does not agree about.
      if (picture.is_primary) {
        const next = pictures.find((p) => p.id !== picture.id);
        if (next) await supabase.from("customer_pictures").update({ is_primary: true }).eq("id", next.id);
      }
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The picture could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  const asked = pictures.find((p) => p.id === pending) ?? null;

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">Pictures</h2>
        <span className="text-xs text-muted">{pictures.length}</span>
      </div>

      {pictures.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No pictures of this shop yet.</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {pictures.map((picture) => (
            <li key={picture.id} className="rounded-xl border border-line p-2">
              <StoredPhoto
                name={picture.description ?? "Shop picture"}
                path={picture.photo_path}
                bucket={CUSTOMERS_BUCKET}
                fallback={<Icon name="building" className="size-6" />}
                className="h-32 w-full rounded-lg"
              />
              <p className="mt-2 truncate text-xs text-muted">
                {picture.description ?? "No caption"}
              </p>

              <div className="mt-2 flex items-center gap-2">
                {picture.is_primary ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-brand">
                    <Icon name="check" className="size-3.5" />
                    Main picture
                  </span>
                ) : (
                  canEdit && (
                    <button
                      type="button"
                      onClick={() => makePrimary(picture.id)}
                      disabled={busy}
                      className="pressable min-h-9 rounded-lg px-2 text-xs font-medium text-muted hover:text-fg disabled:opacity-60"
                    >
                      Make main
                    </button>
                  )
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic("tap");
                      setPending(picture.id);
                    }}
                    disabled={busy}
                    aria-label={`Remove ${picture.description ?? "picture"}`}
                    className="pressable ml-auto flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:text-danger disabled:opacity-60"
                  >
                    <Icon name="trash" className="size-4" />
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="mt-4 grid gap-2 border-t border-line pt-4">
          <Field
            label="Caption for the next picture"
            optional
            value={caption}
            onChange={setCaption}
            placeholder="Shopfront"
            disabled={busy}
          />
          <label className="pressable flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand/50 text-sm font-medium text-brand">
            <Icon name="plus" className="size-4" />
            {busy ? "Working…" : "Add a picture"}
            <input
              type="file"
              accept={ACCEPT}
              className="sr-only"
              disabled={busy}
              onChange={(e) => add(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Sheet
        open={asked !== null}
        onClose={() => setPending(null)}
        title="Remove picture"
      >
        {asked && (
          <div className="space-y-4 px-3 pb-4 pt-1">
            <p className="text-sm text-muted">
              {asked.description
                ? `"${asked.description}" comes off this shop's pictures.`
                : "This picture comes off this shop's pictures."}{" "}
              The record and the file are kept rather than deleted.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={busy}
                className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium text-muted disabled:opacity-60"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => retire(asked)}
                disabled={busy}
                className="pressable min-h-11 flex-1 rounded-xl bg-danger text-sm font-medium text-danger-fg disabled:opacity-60"
              >
                {busy ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </Card>
  );
}
