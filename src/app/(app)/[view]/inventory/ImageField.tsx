"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { INVENTORY_BUCKET } from "@/lib/inventory";

const MAX_BYTES = 5 * 1024 * 1024; // matches the bucket's own limit
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic";

/**
 * A picture on a catalogue record: a category, a brand's logo, a variant.
 *
 * The same shape as the profile photo field and for the same reasons — the
 * bucket is private, so a stored picture is shown through a URL signed in the
 * browser with the viewer's own token, and a newly chosen file is previewed
 * from an object URL and only uploaded when the form is saved. Abandoning a
 * form leaves nothing behind in storage.
 */
export function ImageField({
  label,
  alt,
  path,
  file,
  onChange,
  disabled = false,
  size = "size-16",
}: {
  label: string;
  alt: string;
  path: string | null;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  size?: string;
}) {
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let live = true;
    createClient()
      .storage.from(INVENTORY_BUCKET)
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (live && data?.signedUrl) setSigned({ path, url: data.signedUrl });
      });
    return () => {
      live = false;
    };
  }, [path]);

  // The object URL is created in the event handler, where a side effect
  // belongs; this only releases it when it is replaced or the field goes away.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  const shown =
    (file && preview?.file === file ? preview.url : null) ??
    (path && signed?.path === path ? signed.url : null);

  function choose(next: File | null) {
    if (!next) {
      setPreview(null);
      onChange(null);
      setError(null);
      return;
    }
    if (next.size > MAX_BYTES) {
      setError("That picture is over 5 MB. Please choose a smaller one.");
      return;
    }
    setError(null);
    setPreview({ file: next, url: URL.createObjectURL(next) });
    haptic("select");
    onChange(next);
  }

  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex items-center gap-3">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt={alt}
            className={`${size} shrink-0 rounded-xl border border-line object-cover`}
          />
        ) : (
          <span
            className={`${size} flex shrink-0 items-center justify-center rounded-xl border border-dashed border-line text-muted`}
          >
            <Icon name="box" className="size-6" />
          </span>
        )}

        {!disabled && (
          <div className="flex min-w-0 flex-wrap gap-2">
            <label className="pressable flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-muted hover:text-fg">
              <Icon name="plus" className="size-4" />
              {shown ? "Change" : "Choose picture"}
              <input
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => choose(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <button
                type="button"
                onClick={() => choose(null)}
                className="pressable min-h-10 rounded-xl border border-line px-3 text-sm font-medium text-muted hover:text-fg"
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>

      {file && !error && <p className="text-xs text-muted">Uploads when you save.</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/**
 * Puts a chosen file in the bucket and hands back its path.
 *
 * The timestamp keeps a replacement from being served out of a cache under the
 * name of the picture it replaced.
 */
export async function uploadInventoryImage(
  prefix: string,
  file: File,
): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${prefix}/${Date.now()}.${extension}`;
  const { error } = await createClient()
    .storage.from(INVENTORY_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}
