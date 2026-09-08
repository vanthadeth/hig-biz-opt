/**
 * The map, on open tiles.
 *
 * Leaflet draws it and OpenStreetMap supplies the pictures. That combination
 * needs no API key, which is the whole point: the previous map was a blank
 * grey rectangle on any machine where somebody had not yet been given a key
 * and told where to paste it, and "the map is broken" is what that looks like
 * from the outside.
 *
 * WHERE THE TILES COME FROM IS A SETTING, and it has to be. OpenStreetMap's
 * own servers are run on donations for a community of hobbyists and small
 * projects, and their usage policy is explicit that heavy or commercial use
 * belongs somewhere else. A sales team opening the day's route every morning
 * is exactly the traffic they ask people to take elsewhere. So the default is
 * the standard OSM layer — right for building this and for a few people using
 * it — and one environment variable moves the whole app onto a paid tile host
 * without touching any code.
 *
 * ATTRIBUTION IS NOT DECORATION. OpenStreetMap's data is licensed on the
 * condition that it is credited, so the credit line travels with the tile URL
 * as one setting rather than as two that somebody could change by halves.
 */

export const TILE_URL_ENV = "NEXT_PUBLIC_MAP_TILE_URL";
export const TILE_ATTRIBUTION_ENV = "NEXT_PUBLIC_MAP_TILE_ATTRIBUTION";

const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type TileLayer = { url: string; attribution: string; maxZoom: number };

/**
 * The tile layer to draw with.
 *
 * A custom URL with no attribution beside it falls back to crediting
 * OpenStreetMap, because most alternative hosts serve OSM data and the wrong
 * answer there is to credit nobody.
 */
export function tileLayer(): TileLayer {
  const url = process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim();
  const attribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION?.trim();

  return {
    url: url || OSM_URL,
    attribution: attribution || OSM_ATTRIBUTION,
    // Past nineteen the standard layer has no pictures to give, and a map that
    // zooms into grey is worse than one that stops.
    maxZoom: 19,
  };
}

/**
 * How the page reports what went wrong, in words somebody can act on.
 *
 * There is only one failure left worth naming. With no key to forget, a map
 * that does not appear is a network or a bundle problem, and neither is
 * something the reader can fix by being told a variable name.
 */
export function mapProblem(failed: boolean): string | null {
  return failed
    ? "The map could not be loaded. Check the connection and try again."
    : null;
}

/** Phnom Penh, for a map with nothing yet to show. */
export const DEFAULT_CENTRE = { lat: 11.5564, lng: 104.9282 };
