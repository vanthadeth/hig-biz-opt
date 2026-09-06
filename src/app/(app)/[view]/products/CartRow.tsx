"use client";

import { useRef } from "react";

/** Past this, the finger is going somewhere: it is a scroll, not a press. */
const SLOP = 8;

/** The platform convention on both phones for a press that means something else. */
const HOLD_MS = 500;

/**
 * One line of the cart.
 *
 * Hold it to open the panel that made it, which is also where it is removed.
 * One gesture and one place: a row that could be deleted by moving a thumb
 * across it deleted things nobody meant to delete.
 *
 * The hold tolerates a little movement, because a finger resting on a phone
 * never stays still, and gives up as soon as the movement looks like a scroll.
 *
 * A gesture nobody can see is a gesture some people cannot use, so the row is
 * also a focusable control: Enter opens it, and the line under the list says so.
 */
export function CartRow({
  detail,
  name,
  total,
  disabled,
  onEdit,
}: {
  detail: string;
  name: string;
  total: string;
  disabled: boolean;
  onEdit: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  function clearHold() {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    fired.current = false;
    clearHold();
    hold.current = setTimeout(() => {
      fired.current = true;
      onEdit();
    }, HOLD_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) clearHold();
  }

  function finish() {
    clearHold();
    start.current = null;
  }

  return (
    <li>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${name}. ${detail}. ${total}.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={finish}
        onContextMenu={(e) => {
          // Android raises its own menu on a long press; ours has it.
          if (fired.current) e.preventDefault();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onEdit();
          }
        }}
        className="flex select-none items-center gap-3 py-3 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs tabular-nums text-muted">{detail}</span>
          <span className="block truncate text-sm font-medium">{name}</span>
        </span>
        <span className="shrink-0 text-base font-semibold tabular-nums text-brand">
          {total}
        </span>
      </div>
    </li>
  );
}
