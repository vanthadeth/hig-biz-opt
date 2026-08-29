"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icon";
import { haptic } from "@/lib/haptics";
import {
  applyTheme,
  getServerThemeSnapshot,
  getThemeSnapshot,
  setTheme,
  subscribeTheme,
  THEMES,
  type Theme,
} from "@/lib/theme";

const ICON: Record<Theme, string> = {
  light: "sun",
  dark: "moon",
  system: "display",
};

const NAME: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "Auto",
};

/**
 * A one-tap theme control for the screens that sit outside the app shell.
 *
 * Login and the view chooser have no title bar, so without this there is no way
 * to change the theme until after signing in — which is exactly the wrong time
 * for someone opening the app at night.
 *
 * It cycles rather than opening a menu: at the corner of a screen a single
 * target is easier to hit than a popover, and the label announces both the
 * current state and what the next tap does, so cycling stays predictable.
 * It shares a store with the segmented control in the profile menu, so the two
 * never disagree.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  // On Auto, keep following the operating system while the page is open.
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => applyTheme("system", e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];

  return (
    <button
      type="button"
      onClick={() => {
        haptic("select");
        setTheme(next);
      }}
      aria-label={`Theme: ${NAME[theme]}. Switch to ${NAME[next].toLowerCase()}.`}
      title={`Theme: ${NAME[theme]}`}
      className={`pressable flex size-11 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:text-fg ${className}`}
    >
      <Icon name={ICON[theme]} className="size-5" />
    </button>
  );
}
