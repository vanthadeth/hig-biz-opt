"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { haptic } from "@/lib/haptics";

/** How far left the row must travel before letting go means "remove". */
const REMOVE_AT = 88;

/** Past this, the finger is going somewhere: it is a gesture, not a press. */
const SLOP = 8;

/** The platform convention on both phones for a press that means something else. */
const HOLD_MS = 500;

/**
 * One line of the cart, with the two gestures a phone expects.
 *
 * Hold to change it, swipe left to remove it. Both come off the same pointer
 * stream rather than two hooks fighting over it: the moment a finger moves far
 * enough to be going somewhere, the hold is off and the swipe is on, and there
 * is no arrangement where both fire.
 *
 * `touch-action: pan-y` is what makes the swipe possible without stealing the
 * list's scroll — the browser keeps the vertical axis and hands us the
 * horizontal one, so a thumb moving down the cart never drags a row sideways.
 *
 * A gesture nobody can see is a gesture some people cannot use, so the row is
 * also a focusable control: Enter opens it, Delete asks to remove it. The hint
 * under the list says both out loud.
 */
export function CartRow({
  detail,
  name,
  total,
  disabled,
  onEdit,
  onAskRemove,
}: {
  detail: string;
  name: string;
  total: string;
  disabled: boolean;
  onEdit: () => void;
  onAskRemove: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [sliding, setSliding] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  function clearHold() {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (disabled || e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    fired.current = false;
    setSliding(false);
    clearHold();
    hold.current = setTimeout(() => {
      fired.current = true;
      haptic("select");
      onEdit();
    }, HOLD_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;

    if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) clearHold();

    // Leftwards, and more sideways than down: that is a swipe. Anything else
    // is the list being scrolled and is none of our business.
    if (dx < 0 && Math.abs(dx) > Math.abs(dy)) {
      setOffset(Math.max(dx, -(REMOVE_AT + 32)));
    }
  }

  function finish() {
    clearHold();
    start.current = null;
    setSliding(true);

    if (offset <= -REMOVE_AT) {
      haptic("select");
      onAskRemove();
    }
    setOffset(0);
  }

  return (
    <li className="relative overflow-hidden">
      {/* Revealed as the row travels. Not a button: the gesture is the button,
          and letting go is what presses it. */}
      <span
        aria-hidden
        className="absolute inset-y-0 right-0 flex w-24 items-center justify-center rounded-r-xl bg-danger/12 text-danger"
      >
        <Icon name="trash" className="size-5" />
      </span>

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
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            onAskRemove();
          }
        }}
        style={{
          transform: `translateX(${offset}px)`,
          transition: sliding ? "transform 180ms ease-out" : undefined,
        }}
        className="relative flex touch-pan-y select-none items-center gap-3 bg-surface py-3 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-brand"
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
