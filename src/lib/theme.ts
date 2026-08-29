/**
 * Theme preference: an explicit choice, or defer to the operating system.
 *
 * The resolved theme is expressed as `data-theme` on <html>, which the token
 * blocks in globals.css key off. "system" deliberately writes the resolved value
 * rather than removing the attribute, so the CSS only ever has to reason about
 * two states.
 */
export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "hig-theme";
export const THEMES: Theme[] = ["light", "dark", "system"];

/** Colours the mobile browser chrome takes on, matched to --surface.
 *  Exported because the pre-paint script has to use the same values. */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#ffffff",
  dark: "#121a23",
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as string[]).includes(value);
}

export function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(theme: Theme, osPrefersDark: boolean): ResolvedTheme {
  if (theme === "system") return osPrefersDark ? "dark" : "light";
  return theme;
}

/** The stored preference, or "system" when absent or unrecognised. */
export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    // Private mode and blocked storage both throw rather than returning null.
    return "system";
  }
}

export function storeTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
}

/** Paints a theme: the attribute the CSS reads, plus the browser chrome colour. */
export function applyTheme(theme: Theme, osPrefersDark = prefersDark()): ResolvedTheme {
  const resolved = resolveTheme(theme, osPrefersDark);
  if (typeof document === "undefined") return resolved;

  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[resolved]);

  return resolved;
}

/* ---------------------------------------------------------------------------
 * The preference as an external store.
 *
 * It lives in localStorage and on <html>, not in React, and the server cannot
 * see it. useSyncExternalStore is built for exactly that: it renders the server
 * snapshot during hydration and swaps to the real one immediately after, so
 * there is no mismatch to suppress and no setState-in-an-effect.
 * ------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);

  // Another tab changing the preference should move this one too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyTheme(readStoredTheme());
    emit();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getThemeSnapshot(): Theme {
  return readStoredTheme();
}

export function getServerThemeSnapshot(): Theme {
  return "system";
}

/** Records a choice, paints it, and tells every subscriber. */
export function setTheme(next: Theme): void {
  storeTheme(next);
  applyTheme(next);
  emit();
}
