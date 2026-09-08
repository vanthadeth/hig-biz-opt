import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CENTRE,
  TILE_ATTRIBUTION_ENV,
  TILE_URL_ENV,
  mapProblem,
  tileLayer,
} from "./openMap";

// The values are read through process.env, which Next inlines at build time in
// the browser and leaves readable here. Restored after each test so the order
// they run in cannot matter.
const original = {
  url: process.env.NEXT_PUBLIC_MAP_TILE_URL,
  attribution: process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION,
};

afterEach(() => {
  process.env.NEXT_PUBLIC_MAP_TILE_URL = original.url;
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION = original.attribution;
});

describe("where the tiles come from", () => {
  it("is OpenStreetMap until somebody says otherwise", () => {
    delete process.env.NEXT_PUBLIC_MAP_TILE_URL;
    delete process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION;

    const layer = tileLayer();
    expect(layer.url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(layer.attribution).toContain("OpenStreetMap");
  });

  it("and moves to a paid host on one variable", () => {
    process.env.NEXT_PUBLIC_MAP_TILE_URL = "https://tiles.example.com/{z}/{x}/{y}.png?key=k";
    process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION = "&copy; Example";

    const layer = tileLayer();
    expect(layer.url).toBe("https://tiles.example.com/{z}/{x}/{y}.png?key=k");
    expect(layer.attribution).toBe("&copy; Example");
  });

  // Attribution is a licence condition, and most alternative hosts serve OSM
  // data. Crediting nobody is the one answer that is actually wrong.
  it("credits OpenStreetMap when a custom host names nobody", () => {
    process.env.NEXT_PUBLIC_MAP_TILE_URL = "https://tiles.example.com/{z}/{x}/{y}.png";
    delete process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION;

    expect(tileLayer().attribution).toContain("OpenStreetMap");
  });

  it("treats a blank variable as no variable at all", () => {
    process.env.NEXT_PUBLIC_MAP_TILE_URL = "   ";
    expect(tileLayer().url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  });

  it("stops zooming where the pictures stop", () => {
    expect(tileLayer().maxZoom).toBe(19);
  });

  it("names the environment variables it reads, for the README and the tests", () => {
    expect(TILE_URL_ENV).toBe("NEXT_PUBLIC_MAP_TILE_URL");
    expect(TILE_ATTRIBUTION_ENV).toBe("NEXT_PUBLIC_MAP_TILE_ATTRIBUTION");
  });
});

describe("what the page says when there is no map", () => {
  // With no key to forget, the only failure left is the library or the network,
  // and neither is fixed by telling somebody a variable name.
  it("says nothing while nothing is wrong", () => {
    expect(mapProblem(false)).toBeNull();
  });

  it("and something a reader can act on when it is", () => {
    expect(mapProblem(true)).toBe("The map could not be loaded. Check the connection and try again.");
  });
});

describe("a map with nothing to show yet", () => {
  it("opens on Phnom Penh", () => {
    expect(DEFAULT_CENTRE).toEqual({ lat: 11.5564, lng: 104.9282 });
  });
});
