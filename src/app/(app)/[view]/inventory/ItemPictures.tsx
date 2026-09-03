"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { StoredPhoto } from "@/components/ui/StoredPhoto";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  INVENTORY_BUCKET,
  ITEM_PICTURE_COLUMNS,
  orderPictures,
  type ItemPicture,
} from "@/lib/inventory";

const MAX_BYTES = 5 * 1024 * 1024; // matches the bucket's own limit
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic";

/**
 * The pictures of an item, and which one stands for it.
 *
 * Managed from the record rather than the form, because a picture needs the
 * item to exist before it can be filed: objects go under `items/<id>/`, so
 * there is nowhere to put one until the id exists.
 *
 * Each upload lands immediately rather than waiting for a save — there is no
 * other field on this card to save alongside it, and a photo that vanished
 * because somebody navigated away would be worse than one that appears at once.
 *
 * The same card as the one on a customer record, deliberately: somebody who has
 * learnt one has learnt both.
 */
export function ItemPictures({
  itemId,
  pictures: initial,
  canEdit,
}: {
  itemId: string;
  pictures: ItemPicture[];
  canEdit: boolean;
}) {
  const [pictures, setPictures] = useState(() => orderPictures(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");

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
      // Under the item id, alongside whatever its variants have filed there.
      const path = `items/${itemId}/${Date.now()}.${extension}`;
      const upload = await supabase.storage
        .from(INVENTORY_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upload.error) throw upload.error;

      const { data, error } = await supabase
        .from("item_pictures")
        .insert({
          item_id: itemId,
          photo_path: path,
          description: caption.trim() === "" ? null : caption.trim(),
          // The first picture stands for the item until somebody says otherwise.
          is_primary: pictures.length === 0,
          sort_order: pictures.length + 1,
        })
        .select(ITEM_PICTURE_COLUMNS)
        .single();
      if (error || !data) throw error ?? new Error("The picture was not saved.");

      haptic("success");
      setPictures((list) => orderPictures([...list, data as ItemPicture]));
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
      // Cleared across the item first: the partial unique index means two
      // primaries cannot both stand, even for an instant.
      const cleared = await supabase
        .from("item_pictures")
        .update({ is_primary: false })
        .eq("item_id", itemId)
        .eq("is_primary", true);
      if (cleared.error) throw cleared.error;

      const { data, error } = await supabase
        .from("item_pictures")
        .update({ is_primary: true })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That could not be changed. You may not have permission.");
      }

      haptic("success");
      setPictures((list) =>
        orderPictures(list.map((p) => ({ ...p, is_primary: p.id === id }))),
      );
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "That could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(picture: ItemPicture) {
    setBusy(true);
    setError(null);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("item_pictures")
        .delete()
        .eq("id", picture.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That picture could not be removed. You may not have permission.");
      }

      // The object goes too. A row removed but a file left behind is storage
      // nobody can reach and nobody is counting.
      await supabase.storage.from(INVENTORY_BUCKET).remove([picture.photo_path]);

      haptic("success");
      setPictures((list) => list.filter((p) => p.id !== picture.id));
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The picture could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">Pictures</h2>
        <span className="text-xs text-muted">{pictures.length}</span>
      </div>

      {pictures.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No pictures of this item yet.</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {pictures.map((picture) => (
            <li key={picture.id} className="rounded-xl border border-line p-2">
              <StoredPhoto
                name={picture.description ?? "Item picture"}
                path={picture.photo_path}
                bucket={INVENTORY_BUCKET}
                fallback={<Icon name="box" className="size-6" />}
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
                    onClick={() => remove(picture)}
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
            placeholder="On the shelf"
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
    </Card>
  );
}
