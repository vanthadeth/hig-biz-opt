"use client";

import { useEffect, useRef, useState } from "react";
import { boundsOf, gapLine, padded, routeLines, type MapPin } from "@/lib/mapView";
import { loadMaps, mapsKey, mapsProblem } from "@/lib/googleMaps";

/**
 * The map itself, and nothing else.
 *
 * Google Maps arrives as a script with a key on it, loaded at run time rather
 * than imported, so the page around it renders while the library is still on
 * its way — and says plainly when it never arrives. A blank grey rectangle is
 * the worst way to report a missing key: it looks exactly like no data.
 *
 * Markers are drawn as numbered discs with our own colours, read off the page
 * so they follow the theme. A check-in is a numbered disc, one outside the
 * radius is amber, and a shop is a small hollow ring so it never reads as
 * somebody having been there.
 *
 * These use `google.maps.Marker` rather than `AdvancedMarkerElement`, which
 * needs a cloud-configured Map ID that this app does not have and should not
 * require somebody to create before a map will draw. Google has committed to
 * twelve months' notice before withdrawing it.
 */
export function VisitMapCanvas({ pins }: { pins: MapPin[] }) {
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const key = mapsKey();
  const problem = mapsProblem(key, failed);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;

    loadMaps()
      .then((maps) => {
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

        const map = new maps.Map(holder.current, {
          // A map inside a scrolling page that swallows the wheel is a map that
          // traps the page; dragging and pinching still work.
          gestureHandling: "cooperative",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          center: { lat: 11.5564, lng: 104.9282 },
          zoom: 13,
        });

        const info = new maps.InfoWindow();

        // The shop first, so a check-in disc sits over its ring, not under.
        for (const pin of pins) {
          if (!pin.shop) continue;
          const marker = new maps.Marker({
            map,
            position: { lat: pin.shop.latitude, lng: pin.shop.longitude },
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: surface,
              fillOpacity: 1,
              strokeColor: brand,
              strokeWeight: 2,
            },
            title: pin.shopName,
          });
          marker.addListener("click", () => {
            info.setContent(
              `<strong>${pin.shopName}</strong><br><small>Where the shop is recorded</small>`,
            );
            info.open({ map, anchor: marker });
          });
        }

        for (const pin of pins) {
          const line = gapLine(pin);
          if (!line) continue;
          new maps.Polyline({
            map,
            path: line.map(([lat, lng]) => ({ lat, lng })),
            strokeOpacity: 0,
            // A dashed line, drawn as repeated dots: the gap between where
            // somebody stood and where the shop is recorded.
            icons: [{
              icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2,
                      strokeColor: pin.outOfRange ? warnFg : muted },
              offset: "0",
              repeat: "10px",
            }],
          });
        }

        for (const line of routeLines(pins)) {
          new maps.Polyline({
            map,
            path: line.map(([lat, lng]) => ({ lat, lng })),
            strokeColor: brand,
            strokeWeight: 3,
            strokeOpacity: 0.55,
          });
        }

        for (const pin of pins) {
          if (!pin.at) continue;
          const marker = new maps.Marker({
            map,
            position: { lat: pin.at.latitude, lng: pin.at.longitude },
            zIndex: 10 + pin.order,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: pin.outOfRange ? warnFg : brand,
              fillOpacity: 1,
              strokeWeight: 0,
            },
            label: {
              text: String(pin.order),
              color: pin.outOfRange ? warn : brandFg,
              fontSize: "11px",
              fontWeight: "600",
            },
            title: `${pin.order}. ${pin.shopName}`,
          });
          marker.addListener("click", () => {
            info.setContent(
              `<strong>${pin.order}. ${pin.shopName}</strong><br><small>${
                pin.distanceM === null
                  ? "Distance unknown"
                  : `${Math.round(pin.distanceM)} m from the shop`
              }</small>`,
            );
            info.open({ map, anchor: marker });
          });
        }

        const box = boundsOf(pins);
        if (box) {
          const air = padded(box);
          map.fitBounds(
            new maps.LatLngBounds(
              { lat: air.south, lng: air.west },
              { lat: air.north, lng: air.east },
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [pins, key]);

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
