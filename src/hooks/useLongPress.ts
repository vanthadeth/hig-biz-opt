"use client";

import { useCallback, useRef } from "react";

/**
 * A press held long enough to mean something else.
 *
 * Two things make this usable rather than annoying. It cancels when the finger
 * moves, because a long press and the start of a scroll look identical for the
 * first two hundred milliseconds and guessing wrong steals the scroll. And it
 * suppresses the click that the browser fires afterwards, so a held button does
 * not also do its ordinary job on release.
 *
 * 500ms is the platform convention on both phones; shorter fires while people
 * are still reading the button, longer feels broken.
 */
export function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback(() => {
    fired.current = false;
    clear();
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, ms);
  }, [clear, ms, onLongPress]);

  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    // A scroll begins as a press. Letting the timer run through it would fire
    // the menu in somebody's hand as the list moves under their thumb.
    onPointerMove: clear,
    onContextMenu: (e: React.MouseEvent) => {
      // Android raises its own context menu on a long press; ours has already
      // handled it.
      if (fired.current) e.preventDefault();
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
  };
}
