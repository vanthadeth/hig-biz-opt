"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { boundsOf, gapLine, padded, routeLines, type MapPin } from "@/lib/mapView";
import { DEFAULT_CENTRE, mapProblem, tileLayer } from "@/lib/openMap";

/**
 * The map itself, and nothing else.
 *
 * Leaflet is a browser-only library — it reads `window` on the way in — so it
 * arrives through `import()` inside an effect rather than at the top of the
 * file, which is what the framework's own lazy-loading guide asks for. The
 * page around it renders while the library is still on its way, and says
 * plainly if it never arrives.
 *
 * Every mark is drawn rather than dropped from an icon file: a check-in is a
 * numbered disc, one measured outside the radius is amber, and a shop is a
 * small hollow ring so it never reads as somebody having been there. The
 * colours are read off the page, so the map follows the theme instead of
 * keeping its own idea of the brand — and it means no marker images to load,
 * which is the usual way a Leaflet map ends up with broken icons.
 */
export function VisitMapCanvas({ pins }: { pins: MapPin[] }) {
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!holder.current) return;
    let cancelled = false;
    // Held so the cleanup can take the map down: Leaflet keeps listeners on
    // the window, and a second mount onto a container it still owns throws.
    let map: import("leaflet").Map | null = null;

    import("leaflet")
      .then((L) => {
        if (cancelled || !holder.current) return;

        const css = getComputedStyle(holder.current);
        const token = (name: string, fallback: string) =>
          css.getPropertyValue(name).trim() || fallback;
        const brand = token("--brand", "#1B7FD0");
        const brandFg = token("--brand-fg", "#ffffff");
        const warn = token("--warn", "#fdf0cf");
        const warnFg = token("--warn-fg", "#7a4e00");
        const surface = token("--surface", "#ffffff");
        const muted = token("--muted", "#64707D");

        map = L.map(holder.current, {
          center: [DEFAULT_CENTRE.lat, DEFAULT_CENTRE.lng],
          zoom: 13,
          // A map inside a scrolling page that swallows the wheel is a map that
          // traps the page, so the wheel scrolls past it. Dragging, the zoom
          // buttons and pinching all still work, and pinching is what the
          // phones this is built for actually use.
          scrollWheelZoom: false,
        });

        const tiles = tileLayer();
        L.tileLayer(tiles.url, {
          attribution: tiles.attribution,
          maxZoom: tiles.maxZoom,
        }).addTo(map);

        // The shop first, so a check-in disc sits over its ring, not under.
        for (const pin of pins) {
          if (!pin.shop) continue;
          L.circleMarker([pin.shop.latitude, pin.shop.longitude], {
            radius: 6,
            color: brand,
            weight: 2,
            fillColor: surface,
            fillOpacity: 1,
          })
            .addTo(map)
            .bindPopup(`<strong>${pin.shopName}</strong><br><small>Where the shop is recorded</small>`);
        }

        // The gap between where somebody stood and where the shop is recorded.
        for (const pin of pins) {
          const line = gapLine(pin);
          if (!line) continue;
          L.polyline(line, {
            color: pin.outOfRange ? warnFg : muted,
            weight: 2,
            opacity: 0.9,
            dashArray: "2 8",
          }).addTo(map);
        }

        for (const line of routeLines(pins)) {
          L.polyline(line, { color: brand, weight: 3, opacity: 0.55 }).addTo(map);
        }

        for (const pin of pins) {
          if (!pin.at) continue;
          const fill = pin.outOfRange ? warnFg : brand;
          const ink = pin.outOfRange ? warn : brandFg;
          L.marker([pin.at.latitude, pin.at.longitude], {
            title: `${pin.order}. ${pin.shopName}`,
            zIndexOffset: 10 + pin.order,
            icon: L.divIcon({
              className: "",
              iconSize: [24, 24],
              iconAnchor: [12, 12],
              popupAnchor: [0, -12],
              html:
                `<span style="display:grid;place-items:center;width:24px;height:24px;` +
                `border-radius:9999px;background:${fill};color:${ink};` +
                `font:600 11px/1 system-ui,sans-serif">${pin.order}</span>`,
            }),
          })
            .addTo(map)
            .bindPopup(
              `<strong>${pin.order}. ${pin.shopName}</strong><br><small>${
                pin.distanceM === null
                  ? "Distance unknown"
                  : `${Math.round(pin.distanceM)} m from the shop`
              }</small>`,
            );
        }

        const box = boundsOf(pins);
        if (box) {
          const air = padded(box);
          map.fitBounds([
            [air.south, air.west],
            [air.north, air.east],
          ]);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [pins]);

  const problem = mapProblem(failed);
  if (problem) {
    return (
      <div
        role="status"
        className="grid h-[60vh] min-h-72 w-full place-items-center rounded-2xl border border-dashed border-line bg-subtle p-6 text-center text-sm text-muted"
      >
        {problem}
      </div>
    );
  }

  return (
    <div
      ref={holder}
      role="application"
      aria-label="Map of the day's visits"
      className="h-[60vh] min-h-72 w-full overflow-hidden rounded-2xl border border-line bg-subtle"
    />
  );
}
