/**
 * Short vibrations on the interactions that would buzz in a native app.
 *
 * Caveat worth knowing: the Vibration API is Android-only. iOS Safari has never
 * shipped it, so on an iPhone every call here is a silent no-op. There is no web
 * API that reaches the Taptic Engine, so this is as far as a web app can go.
 *
 * Every call is guarded and returns whether it actually fired, which is also
 * what makes it testable.
 */
export type HapticPattern = "tap" | "select" | "success" | "warning" | "error";

/** Milliseconds, or alternating vibrate/pause runs. Kept short: a long buzz
 *  reads as an error even when nothing is wrong. */
const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  select: 12,
  success: [12, 40, 18],
  warning: [16, 60, 16],
  error: [24, 50, 24, 50, 24],
};

function reducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function haptic(pattern: HapticPattern = "tap"): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return false;
  }

  // There is no "prefers-reduced-haptics", and someone who has asked their
  // device to calm down is unlikely to want it buzzing on every tap.
  if (reducedMotion()) return false;

  try {
    return navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Some browsers throw when the page is not visible or lacks a user gesture.
    return false;
  }
}
