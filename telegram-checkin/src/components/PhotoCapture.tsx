"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * The camera. `capture` asks for the front camera rather than the gallery,
 * which Telegram's webview honours on both iOS and Android; where it does not,
 * this degrades to an ordinary file picker rather than to nothing.
 */
export function PhotoCapture({
  photo,
  onChange,
  disabled,
}: {
  photo: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);

  // Derived from the file, so it is computed rather than stored: keeping it in
  // state would mean a render showing the old photo with the new file.
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);

  // An object URL is held until revoked, and a retake makes a new one each time.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="flex items-center gap-3">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="pressable flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-bg disabled:opacity-50"
        aria-label={photo ? "Retake your photo" : "Take your photo"}
      >
        {preview ? (
          // A blob preview, not a remote image: next/image would gain nothing
          // and cannot optimise an object URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <CameraIcon />
        )}
      </button>

      <div className="min-w-0">
        <p className="text-sm font-medium">{photo ? "Photo taken" : "Photo"}</p>
        <p className="text-sm text-muted">
          {photo ? "Tap to retake" : "Tap to take one"}
        </p>
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-6 text-muted" aria-hidden="true">
      <path
        d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2a1 1 0 0 0 .8-.4l.9-1.2a1 1 0 0 1 .8-.4h5.6a1 1 0 0 1 .8.4l.9 1.2a1 1 0 0 0 .8.4h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
