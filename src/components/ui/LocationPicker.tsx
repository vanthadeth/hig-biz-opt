"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/I18nProvider";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { loadMaps, mapsKey, mapsProblem } from "@/lib/googleMaps";

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

  const key = mapsKey();

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
        {key === null ? (
          <p role="status" className="p-6 text-center text-sm text-muted">
            {mapsProblem(null, false)}
          </p>
        ) : (
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
        )}
      </Sheet>
    </>
  );
}

const PHNOM_PENH = { lat: 11.5564, lng: 104.9282 };

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
    let cancelled = false;

    loadMaps()
      .then((maps) => {
        if (cancelled || !holder.current) return;

        const start =
          latitude !== null && longitude !== null
            ? { lat: latitude, lng: longitude }
            : PHNOM_PENH;

        const map = new maps.Map(holder.current, {
          center: start,
          zoom: latitude !== null ? 18 : 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy", // Inside a sheet there is nothing to trap.
        });

        const marker = new maps.Marker({
          map,
          position: start,
          draggable: true,
          visible: latitude !== null,
        });

        const place = (lat: number, lng: number) => {
          marker.setPosition({ lat, lng });
          marker.setVisible(true);
          if (!cancelled) setAt({ lat, lng });
        };

        // Tap anywhere to drop it; drag to nudge. Both, because a thumb is
        // good at the first and bad at the second on a small screen.
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) place(e.latLng.lat(), e.latLng.lng());
        });
        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          if (p) place(p.lat(), p.lng());
        });

        // Only offered if the browser will give it; never taken without asking.
        if (latitude === null && typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (cancelled) return;
              map.setCenter({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              });
              map.setZoom(17);
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
    };
  }, [latitude, longitude]);

  if (failed) {
    return (
      <p role="status" className="p-6 text-center text-sm text-muted">
        {mapsProblem(mapsKey(), true)}
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
