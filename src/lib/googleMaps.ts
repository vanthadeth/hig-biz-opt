/**
 * Loading Google Maps, once.
 *
 * The API is a script tag with a key on it, and the key is public by design —
 * it goes into the browser either way, and Google's own advice is to restrict
 * it by HTTP referrer in the console rather than to hide it. So it lives in
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
 *
 * WITHOUT A KEY THE MAP SAYS SO. A missing key is a configuration mistake
 * somebody can fix in a minute, and a blank grey rectangle is the worst
 * possible way to report it — indistinguishable from no data, a slow network,
 * or a bug. `mapsKey()` returning null is what the screens branch on.
 *
 * The loader is a module-level promise so that two maps on one page — the
 * visit map and a location picker in a sheet over it — share one script rather
 * than racing to append two.
 */

export const MAPS_KEY_ENV = "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY";

/** The key, or null when nobody has configured one. */
export function mapsKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key ? key : null;
}

/**
 * The script URL.
 *
 * `loading=async` is what Google asks for and what silences its console
 * warning; `v=weekly` pins a channel rather than a version, which is their
 * recommendation for a map that should keep working without maintenance.
 */
export function mapsScriptUrl(key: string, libraries: string[] = []): string {
  const params = new URLSearchParams({ key, v: "weekly", loading: "async" });
  if (libraries.length > 0) params.set("libraries", libraries.join(","));
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

/** How the page reports what went wrong, in words somebody can act on. */
export function mapsProblem(key: string | null, failed: boolean): string | null {
  if (key === null) {
    return `Maps are not set up. Add ${MAPS_KEY_ENV} to the environment and reload.`;
  }
  if (failed) {
    return "The map could not be loaded. Check the connection, and that the key allows this site.";
  }
  return null;
}

let pending: Promise<typeof google.maps> | null = null;

/**
 * Load the API and resolve with `google.maps`.
 *
 * Rejects rather than hanging when there is no key, so every caller has one
 * error path instead of a spinner that never stops.
 */
export function loadMaps(): Promise<typeof google.maps> {
  if (pending) return pending;

  const key = mapsKey();
  if (key === null) {
    return Promise.reject(new Error(`${MAPS_KEY_ENV} is not set`));
  }
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Maps can only be loaded in a browser"));
  }

  pending = new Promise<typeof google.maps>((resolve, reject) => {
    // Already there — a second mount, or a script somebody else added.
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>("script[data-google-maps]");
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error("Google Maps loaded without an API"));
    });
    script.addEventListener("error", () => {
      // Cleared so a later attempt can retry rather than inheriting a promise
      // that is permanently rejected.
      pending = null;
      reject(new Error("Could not load Google Maps"));
    });

    if (!existing) {
      script.src = mapsScriptUrl(key);
      script.async = true;
      script.dataset.googleMaps = "true";
      document.head.appendChild(script);
    }
  });

  return pending;
}

/** For tests, which must not inherit a promise from the test before. */
export function resetMapsLoader(): void {
  pending = null;
}
