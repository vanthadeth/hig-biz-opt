"use client";

import { useEffect, useState } from "react";

/**
 * True once the page has been scrolled down far enough that the chrome should
 * get out of the way. Scrolling up, or returning near the top, brings it back.
 *
 * Only the phone layout acts on this; the rail and sidebar layouts pin their
 * chrome regardless, so there is no media query here.
 */
export function useScrollHidden(threshold = 64) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const current = window.scrollY;
        const delta = current - last;

        // Ignore rubber-banding and sub-pixel jitter.
        if (Math.abs(delta) < 6) return;

        if (current < threshold) {
          setHidden(false);
        } else if (delta > 0) {
          setHidden(true);
        } else {
          setHidden(false);
        }
        last = current;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return hidden;
}

/**
 * True once the page is scrolled past a point, and false again near the top.
 *
 * Deliberately not the direction hook above. Chrome that reappears on any
 * upward flick is right for a title bar, which occupies a fixed strip; it is
 * wrong for a panel that grows, because expanding under somebody's thumb while
 * they read pushes the thing they were looking at off the screen. This only
 * changes when they are actually back near the top.
 */
export function useScrolledPast(threshold = 120) {
  const [past, setPast] = useState(false);

  useEffect(() => {
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setPast(window.scrollY > threshold);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return past;
}
