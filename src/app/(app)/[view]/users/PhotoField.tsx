"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/users";

const MAX_BYTES = 5 * 1024 * 1024; // matches the bucket's own limit
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic";

/**
 * The profile photo.
 *
 * The avatars bucket is private, so a stored photo is shown through a signed
 * URL fetched in the browser with the viewer's own token — which means the
 * storage policies decide whether it appears, exactly as they do for the record
 * itself. A newly chosen file is previewed from an object URL and only uploaded
 * when the form is saved, so abandoning a form leaves nothing behind.
 */
export function PhotoField({
  name,
  path,
  file,
  onChange,
  disabled = false,
}: {
  name: string;
  path: string | null;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  // Both URLs are stored with what produced them, so the "nothing to show" case
  // is read off the props rather than written back through setState — an effect
  // that sets state on its own first pass is the cascading render the linter is
  // right to object to.
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let live = true;
    createClient()
      .storage.from("avatars")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (live && data?.signedUrl) setSigned({ path, url: data.signedUrl });
      });
    return () => {
      live = false;
    };
  }, [path]);

  // The object URL is created where the file is picked — an event handler is
  // where a side effect belongs — and this only takes care of releasing it when
  // it is replaced or the field goes away.
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
      setError("That photo is over 5 MB. Please choose a smaller one.");
      return;
    }
    setError(null);
    setPreview({ file: next, url: URL.createObjectURL(next) });
    haptic("select");
    onChange(next);
  }

  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted">Profile photo</span>
      <div className="flex items-center gap-3">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt={name}
            className="size-16 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-brand text-lg font-semibold text-brand-fg">
            {initials(name)}
          </span>
        )}

        {!disabled && (
          <div className="flex min-w-0 flex-wrap gap-2">
            <label className="pressable flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-muted hover:text-fg">
              <Icon name="user" className="size-4" />
              {shown ? "Change" : "Choose photo"}
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

      {file && !error && (
        <p className="text-xs text-muted">Uploads when you save.</p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
