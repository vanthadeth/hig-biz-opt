import { afterEach, describe, expect, it, vi } from "vitest";
import { MAPS_KEY_ENV, mapsProblem, mapsScriptUrl, mapsKey, loadMaps, resetMapsLoader } from "./googleMaps";

afterEach(() => {
  resetMapsLoader();
  vi.unstubAllEnvs();
});

describe("the script URL", () => {
  it("carries the key, a pinned channel and the async flag Google asks for", () => {
    const url = new URL(mapsScriptUrl("abc123"));
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/js");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("v")).toBe("weekly");
    expect(url.searchParams.get("loading")).toBe("async");
  });

  it("asks for no libraries unless some are wanted", () => {
    expect(new URL(mapsScriptUrl("k")).searchParams.get("libraries")).toBeNull();
    expect(new URL(mapsScriptUrl("k", ["places", "marker"])).searchParams.get("libraries"))
      .toBe("places,marker");
  });

  it("escapes a key rather than pasting it into a query string", () => {
    const url = new URL(mapsScriptUrl("a b&c=d"));
    expect(url.searchParams.get("key")).toBe("a b&c=d");
  });
});

describe("the key", () => {
  it("is null when nobody has set one", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    expect(mapsKey()).toBeNull();
  });

  it("and null for whitespace, which is a mistake rather than a key", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "   ");
    expect(mapsKey()).toBeNull();
  });

  it("is the key when there is one, trimmed", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "  abc  ");
    expect(mapsKey()).toBe("abc");
  });
});

/**
 * A blank grey rectangle is the worst way to report a missing key: it looks
 * exactly like no data, a slow network, or a bug. Each of these says which.
 */
describe("what the page tells somebody", () => {
  it("names the variable to set when there is no key", () => {
    const said = mapsProblem(null, false);
    expect(said).toContain(MAPS_KEY_ENV);
  });

  it("says something different when the script itself would not load", () => {
    expect(mapsProblem("abc", true)).toMatch(/could not be loaded/);
    expect(mapsProblem("abc", true)).not.toContain(MAPS_KEY_ENV);
  });

  it("and nothing at all when the map is fine", () => {
    expect(mapsProblem("abc", false)).toBeNull();
  });
});

describe("loading", () => {
  it("refuses rather than hanging when there is no key", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    await expect(loadMaps()).rejects.toThrow(MAPS_KEY_ENV);
  });
});
