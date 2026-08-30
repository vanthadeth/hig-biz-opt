"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * A bottom sheet: the phone-native way to offer a short list of choices.
 *
 * Rises from the bottom on small screens and centres as a dialog from `sm` up,
 * because a sheet glued to the bottom of a desktop window reads as a mistake.
 *
 * Rendered into `document.body` rather than in place. Both bars that open one
 * slide themselves out of the way with a transform, and a transformed ancestor
 * becomes the containing block for `position: fixed` — so left where it sits,
 * the sheet anchors to the title bar instead of the viewport.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Every caller builds its `onClose` inline, so the prop is a new function on
  // each render. Held in a ref, the effect below can read the current one while
  // depending on nothing but `open` — which is what makes it run once per
  // opening rather than once per render. That distinction is the whole bug it
  // used to have: a sheet with a text box in it re-rendered on every keystroke,
  // the effect re-ran, and `panelRef.focus()` took the caret out of the box
  // after a single character.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);

    // A sheet over a scrolling page lets the page move underneath it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus in, so the keyboard and screen readers follow the sheet.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        style={{ animation: "fade-in 180ms ease-out both" }}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-t-3xl border border-line bg-surface shadow-[var(--shadow-pop)] outline-none sm:rounded-3xl"
        style={{
          animation: "sheet-up 260ms cubic-bezier(0.22, 1, 0.36, 1) both",
          paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)",
        }}
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-line" />
        </div>

        <h2 className="px-5 pb-1 pt-3 text-base font-semibold tracking-tight">{title}</h2>
        <div className="px-2 pb-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
