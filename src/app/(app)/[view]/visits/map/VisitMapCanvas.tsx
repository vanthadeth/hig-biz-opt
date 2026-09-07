"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { boundsOf, gapLine, padded, routeLines, type MapPin } from "@/lib/mapView";

/**
 * The map itself, and nothing else.
 *
 * Leaflet is imported at run time rather than at the top of the module: it
 * touches `window` on the way in, so a static import would break the server
 * render of the page around it. This component is only ever the map, so
 * everything above it renders while the library is still arriving.
 *
 * Markers are drawn as our own HTML rather than Leaflet's default pin, which
 * would need image files served from a path Next does not publish. Doing it
 * ourselves also means the numbers and the colours are ours: a check-in is a
 * numbered blue disc, one outside the radius is amber, and a shop is a small
 * hollow ring so it never reads as somebody having been there.
 *
 * Tiles come from OpenStreetMap. They are the reason this needs a network, and
 * the only part of the screen that does — pins, lines and numbers are all
 * drawn locally, so a map with no tiles still shows where everybody was, on a
 * blank ground.
 */
export function VisitMapCanvas({ pins }: { pins: MapPin[] }) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !holder.current) return;

      // React can run an effect twice in development; a second Leaflet on the
      // same element throws rather than replacing the first.
      if (map.current) {
        map.current.remove();
        map.current = null;
      }

      const instance = L.map(holder.current, {
        // A map inside a scrolling page that swallows the wheel is a map that
        // traps the page. Dragging and pinching still work.
        scrollWheelZoom: false,
        attributionControl: true,
      });
      map.current = instance;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(instance);

      // The palette, read off the page rather than written twice. Markers are
      // built as HTML strings, which Tailwind cannot scan, and the lines are
      // drawn onto a canvas that takes a colour rather than a class — so both
      // ask the stylesheet for the token and follow the theme for free.
      const css = getComputedStyle(holder.current);
      const token = (name: string, fallback: string) =>
        css.getPropertyValue(name).trim() || fallback;
      const brand = token("--brand", "#1B7FD0");
      const brandFg = token("--brand-fg", "#ffffff");
      const warn = token("--warn", "#fdf0cf");
      const warnFg = token("--warn-fg", "#7a4e00");
      const surface = token("--surface", "#ffffff");
      const muted = token("--muted", "#64707D");

      // Leaflet's own stylesheet paints the container light grey, which is a
      // pale slab in a dark page for as long as the tiles are still coming —
      // and permanently, for anybody offline. An inline style beats its class.
      holder.current.style.background = token("--subtle", "#EEF2F7");

      // The shop first, so a check-in disc sits over its ring rather than under.
      for (const pin of pins) {
        if (!pin.shop) continue;
        L.marker([pin.shop.latitude, pin.shop.longitude], {
          icon: L.divIcon({
            className: "",
            html:
              `<span style="display:block;width:12px;height:12px;border-radius:9999px;` +
              `border:2px solid ${brand};background:${surface}"></span>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          }),
        })
          .addTo(instance)
          .bindPopup(`${pin.shopName}<br><small>Where the shop is recorded</small>`);
      }

      for (const pin of pins) {
        const line = gapLine(pin);
        if (line) {
          L.polyline(line, {
            color: pin.outOfRange ? warnFg : muted,
            weight: 1.5,
            dashArray: "4 4",
          }).addTo(instance);
        }
      }

      for (const line of routeLines(pins)) {
        L.polyline(line, { color: brand, weight: 3, opacity: 0.55 }).addTo(instance);
      }

      for (const pin of pins) {
        if (!pin.at) continue;
        const fill = pin.outOfRange ? warnFg : brand;
        const ink = pin.outOfRange ? warn : brandFg;
        L.marker([pin.at.latitude, pin.at.longitude], {
          icon: L.divIcon({
            className: "",
            html:
              `<span style="display:grid;place-items:center;width:24px;height:24px;` +
              `border-radius:9999px;background:${fill};color:${ink};font-size:11px;` +
              `font-weight:600;box-shadow:0 1px 3px rgb(0 0 0 / .35)">${pin.order}</span>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        })
          .addTo(instance)
          .bindPopup(
            `<strong>${pin.order}. ${pin.shopName}</strong><br>` +
              `<small>${
                pin.distanceM === null
                  ? "Distance unknown"
                  : `${Math.round(pin.distanceM)} m from the shop`
              }</small>`,
          );
      }

      const box = boundsOf(pins);
      if (box) {
        const air = padded(box);
        instance.fitBounds([
          [air.south, air.west],
          [air.north, air.east],
        ]);
      }
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [pins]);

  return (
    <div
      ref={holder}
      role="application"
      aria-label="Map of the day's visits"
      className="h-[60vh] min-h-72 w-full overflow-hidden rounded-2xl border border-line bg-subtle"
    />
  );
}
