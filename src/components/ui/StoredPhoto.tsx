"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/users";

/**
 * A photo out of the private avatars bucket, or initials when there is none.
 *
 * The URL is signed in the browser with the viewer's own token, so the storage
 * policies decide whether the photo appears — the same rule that governs the
 * record it belongs to. Initials show while the URL is in flight, so the space
 * never collapses and then jumps.
 */
export function StoredPhoto({
  name,
  path,
  className = "size-20 text-2xl",
}: {
  name: string;
  path: string | null;
  className?: string;
}) {
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);

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

  const url = path && signed?.path === path ? signed.url : null;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className={`shrink-0 rounded-2xl object-cover ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-brand font-semibold text-brand-fg ${className}`}
    >
      {initials(name)}
    </span>
  );
}
