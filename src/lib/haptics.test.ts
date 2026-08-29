import { describe, expect, it, vi } from "vitest";
import { haptic } from "./haptics";

/** jsdom ships no `vibrate`, so each test installs the shape it needs. */
function withVibrate(impl: (p: number | number[]) => boolean) {
  const vibrate = vi.fn(impl);
  vi.stubGlobal("navigator", { ...navigator, vibrate });
  return vibrate;
}

/** jsdom implements no media queries either, so this stands one in. */
function withReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

describe("haptic", () => {
  it("does nothing on a browser without the Vibration API", () => {
    // iOS Safari, which has never shipped it — the common case for this app.
    expect(haptic("tap")).toBe(false);
  });

  it("passes the pattern through and reports that it fired", () => {
    const vibrate = withVibrate(() => true);

    expect(haptic("tap")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it("sends a multi-part pattern for success", () => {
    const vibrate = withVibrate(() => true);

    haptic("success");

    expect(vibrate).toHaveBeenCalledWith([12, 40, 18]);
  });

  it("defaults to a tap", () => {
    const vibrate = withVibrate(() => true);

    haptic();

    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it("stays silent when the device asks for reduced motion", () => {
    const vibrate = withVibrate(() => true);
    withReducedMotion(true);

    expect(haptic("error")).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("still fires when reduced motion is not requested", () => {
    const vibrate = withVibrate(() => true);
    withReducedMotion(false);

    expect(haptic("warning")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([16, 60, 16]);
  });

  it("swallows a throwing vibrate rather than breaking the click", () => {
    // Chrome throws when the page is hidden or the call has no user gesture.
    withVibrate(() => {
      throw new Error("blocked");
    });

    expect(() => haptic("select")).not.toThrow();
    expect(haptic("select")).toBe(false);
  });

  it("reports false when the browser declines the request", () => {
    withVibrate(() => false);

    expect(haptic("tap")).toBe(false);
  });
});
