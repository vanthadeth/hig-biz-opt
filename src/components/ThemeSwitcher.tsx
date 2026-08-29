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
  type Theme,
} from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "Auto", icon: "display" },
];

/**
 * Light / Dark / Auto, as a segmented control.
 *
 * Kept out of TitleBar so it can be tested on its own, without a Supabase client
 * and the shell context in tow.
 */
export function ThemeSwitcher() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  // On Auto, follow the operating system as it changes — at sunset, or when the
  // phone switches to dark to save battery.
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => applyTheme("system", e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  return (
    <div className="px-4 py-3">
      <p className="mb-2 text-xs font-medium text-muted">Appearance</p>
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="flex gap-1 rounded-xl bg-subtle p-1"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={theme === option.value}
            onClick={() => {
              haptic("select");
              setTheme(option.value);
            }}
            className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-muted transition-colors aria-checked:bg-surface aria-checked:text-fg aria-checked:shadow-sm hover:text-fg"
          >
            <Icon name={option.icon} className="size-4" />
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
