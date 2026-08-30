"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/users";

/**
 * A photo out of a private bucket, or a stand-in when there is none.
 *
 * The URL is signed in the browser with the viewer's own token, so the storage
 * policies decide whether the photo appears — the same rule that governs the
 * record it belongs to. Initials show while the URL is in flight, so the space
 * never collapses and then jumps.
 *
 * The shape comes from `className`, rounding included. A default `rounded-2xl`
 * baked into the base string would collide with a caller asking for
 * `rounded-full`, and which one won would depend on the order Tailwind emitted
 * the two rules rather than the order they were written.
 */
export function StoredPhoto({
  name,
  path,
  bucket = "avatars",
  fallback,
  className = "size-20 rounded-2xl text-2xl",
}: {
  name: string;
  path: string | null;
  /** Which private bucket the path is in. */
  bucket?: string;
  /** Shown when there is no photo. Initials, unless something else fits better. */
  fallback?: React.ReactNode;
  className?: string;
}) {
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    let live = true;
    createClient()
      .storage.from(bucket)
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (live && data?.signedUrl) setSigned({ path, url: data.signedUrl });
      });
    return () => {
      live = false;
    };
  }, [bucket, path]);

  const url = path && signed?.path === path ? signed.url : null;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className={`shrink-0 object-cover ${className}`}
      />
    );
  }

  if (fallback !== undefined) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center bg-subtle text-muted ${className}`}
      >
        {fallback}
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-brand font-semibold text-brand-fg ${className}`}
    >
      {initials(name)}
    </span>
  );
}
