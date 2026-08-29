import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useScrollHidden } from "./useScrollDirection";

let queued: FrameRequestCallback[] = [];

/** Scrolls to an absolute offset and lets the queued rAF callback run. */
function scrollTo(y: number) {
  act(() => {
    window.scrollY = y;
    window.dispatchEvent(new Event("scroll"));
    const pending = queued;
    queued = [];
    pending.forEach((cb) => cb(0));
  });
}

beforeEach(() => {
  queued = [];
  // Queue rather than invoke: the hook stores the rAF id and the callback
  // clears it, so a callback that ran *before* rAF returned would leave the id
  // set forever and swallow every later scroll.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queued.push(cb);
    return queued.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  window.scrollY = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useScrollHidden", () => {
  it("starts visible", () => {
    const { result } = renderHook(() => useScrollHidden());
    expect(result.current).toBe(false);
  });

  it("hides once scrolled down past the threshold", () => {
    const { result } = renderHook(() => useScrollHidden());
    scrollTo(300);
    expect(result.current).toBe(true);
  });

  it("comes back on the way up", () => {
    const { result } = renderHook(() => useScrollHidden());
    scrollTo(300);
    expect(result.current).toBe(true);
    scrollTo(200);
    expect(result.current).toBe(false);
  });

  it("stays visible while still near the top, even scrolling down", () => {
    const { result } = renderHook(() => useScrollHidden());
    // Past the 6px jitter guard but under the 64px threshold.
    scrollTo(40);
    expect(result.current).toBe(false);
  });

  it("reappears as soon as the page returns to the top", () => {
    const { result } = renderHook(() => useScrollHidden());
    scrollTo(500);
    expect(result.current).toBe(true);
    scrollTo(0);
    expect(result.current).toBe(false);
  });

  it("ignores jitter smaller than 6px", () => {
    const { result } = renderHook(() => useScrollHidden());
    scrollTo(300);
    expect(result.current).toBe(true);
    // A 3px twitch upward must not flap the chrome back into view.
    scrollTo(297);
    expect(result.current).toBe(true);
  });

  it("accumulates sub-threshold movement rather than dropping it", () => {
    const { result } = renderHook(() => useScrollHidden());
    scrollTo(300);
    scrollTo(297); // ignored, and `last` deliberately stays at 300
    scrollTo(293); // 7px below `last`, so this one counts as scrolling up
    expect(result.current).toBe(false);
  });

  it("respects a custom threshold", () => {
    const { result } = renderHook(() => useScrollHidden(500));
    scrollTo(300);
    expect(result.current).toBe(false);
    scrollTo(600);
    expect(result.current).toBe(true);
  });

  it("removes its listener on unmount", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useScrollHidden());
    unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
