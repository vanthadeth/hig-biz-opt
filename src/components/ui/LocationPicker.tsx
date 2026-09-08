"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/I18nProvider";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { DEFAULT_CENTRE, mapProblem, tileLayer } from "@/lib/openMap";

/**
 * Putting a shop on the map.
 *
 * "Use my location" is right when the rep is standing in the shop, and that is
 * the common case. This is for the other one: the shop was added back at the
 * office from a phone call, or the fix came out on the wrong side of the road,
 * or somebody is correcting a pin months later. Dragging a marker onto a
 * roofline is something a person can do accurately from an armchair and cannot
 * do at all by typing six decimal places.
 *
 * The map opens on the pin if there is one, otherwise on the device's own
 * position, otherwise on Phnom Penh — each a better guess than the one after
 * it, and none of them written to the record until the pin is actually placed.
 */
export function LocationPicker({
  latitude,
  longitude,
  disabled = false,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  disabled?: boolean;
  onPick: (latitude: number, longitude: number) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          haptic("tap");
          setOpen(true);
        }}
        className="pressable flex min-h-10 items-center gap-1.5 rounded-xl border border-dashed border-brand/50 px-3 text-sm font-medium text-brand disabled:opacity-60"
      >
        <Icon name="pin" className="size-4" />
        {latitude === null ? t("customer.pickOnMap") : t("customer.movePin")}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("customer.whereIsShop")}>
        <PickerMap
          latitude={latitude}
          longitude={longitude}
          onPick={(lat, lng) => {
            haptic("success");
            onPick(lat, lng);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </Sheet>
    </>
  );
}

function PickerMap({
  latitude,
  longitude,
  onPick,
  onCancel,
}: {
  latitude: number | null;
  longitude: number | null;
  onPick: (latitude: number, longitude: number) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // What the marker is on right now. Held here rather than read back off the
  // map, so Confirm writes exactly what the reader can see.
  const [at, setAt] = useState<{ lat: number; lng: number } | null>(
    latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null,
  );

  useEffect(() => {
    if (!holder.current) return;
    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    // Browser-only, so it arrives through import() in an effect rather than at
    // the top of the file.
    import("leaflet")
      .then((L) => {
        if (cancelled || !holder.current) return;

        const start =
          latitude !== null && longitude !== null
            ? { lat: latitude, lng: longitude }
            : DEFAULT_CENTRE;

        map = L.map(holder.current, {
          center: [start.lat, start.lng],
          zoom: latitude !== null ? 18 : 13,
          // Inside a sheet there is no page behind to trap, so the wheel is
          // free here where it is not on the visit map.
          scrollWheelZoom: true,
        });

        const tiles = tileLayer();
        L.tileLayer(tiles.url, {
          attribution: tiles.attribution,
          maxZoom: tiles.maxZoom,
        }).addTo(map);

        // A real marker rather than a circle with drag bolted on: Leaflet's own
        // dragging handles touch, and touch is what this is for. The icon is
        // drawn instead of loaded, which is how a Leaflet map usually ends up
        // with a broken image where its marker should be.
        const brand =
          getComputedStyle(holder.current).getPropertyValue("--brand").trim() || "#1B7FD0";
        const pin = L.marker([start.lat, start.lng], {
          draggable: true,
          autoPan: true,
          icon: L.divIcon({
            className: "",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html:
              `<span style="display:block;width:22px;height:22px;border-radius:9999px;` +
              `background:${brand};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
          }),
        });
        if (latitude !== null) pin.addTo(map);

        const place = (lat: number, lng: number) => {
          pin.setLatLng([lat, lng]);
          if (map && !map.hasLayer(pin)) pin.addTo(map);
          if (!cancelled) setAt({ lat, lng });
        };

        // Tap anywhere to drop it; drag to nudge. Both, because a thumb is
        // good at the first and bad at the second on a small screen.
        map.on("click", (e) => place(e.latlng.lat, e.latlng.lng));
        pin.on("dragend", () => {
          const p = pin.getLatLng();
          place(p.lat, p.lng);
        });

        // Only offered if the browser will give it; never taken without asking.
        if (latitude === null && typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (cancelled || !map) return;
              map.setView([position.coords.latitude, position.coords.longitude], 17);
            },
            () => {},
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
          );
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [latitude, longitude]);

  if (failed) {
    return (
      <p role="status" className="p-6 text-center text-sm text-muted">
        {mapProblem(true)}
      </p>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <div
        ref={holder}
        role="application"
        aria-label={t("customer.whereIsShop")}
        className="h-[45vh] min-h-64 w-full overflow-hidden rounded-2xl border border-line bg-subtle"
      />

      <p className="text-center text-xs tabular-nums text-muted">
        {at
          ? `${at.lat.toFixed(6)}, ${at.lng.toFixed(6)}`
          : t("customer.dropAPin")}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={at === null}
          onClick={() => at && onPick(at.lat, at.lng)}
          className="pressable min-h-11 flex-[2] rounded-xl bg-brand text-sm font-semibold text-brand-fg disabled:opacity-50"
        >
          {t("customer.useThisSpot")}
        </button>
      </div>
    </div>
  );
}
