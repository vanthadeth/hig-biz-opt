"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/I18nProvider";
import { LocationPicker } from "@/components/ui/LocationPicker";
import { Field, SelectField } from "@/components/ui/Field";
import { haptic } from "@/lib/haptics";
import {
  coordinateProblem,
  formatAccuracy,
  formatCoordinate,
  locationProblem,
  type Province,
} from "@/lib/customers";

export type AddressDraft = {
  street_address: string;
  province_code: string;
  province_text: string;
  district_text: string;
  commune_text: string;
  landmark: string;
  zipcode: string;
  latitude: string;
  longitude: string;
};

/**
 * Where the shop is.
 *
 * The province is chosen, because that list is real, short, and the one thing
 * the customer book actually groups by. The district and the commune are typed,
 * because they are words: HIG sells into places whose commune is in no dataset
 * anybody maintains, and a rep standing in the shop cannot wait for one to
 * exist. What they write is the record.
 */
export function AddressFields({
  draft,
  provinces,
  disabled,
  onChange,
}: {
  draft: AddressDraft;
  provinces: Province[];
  disabled: boolean;
  onChange: (next: AddressDraft) => void;
}) {
  const t = useT();
  const set = (changes: Partial<AddressDraft>) => onChange({ ...draft, ...changes });

  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<string | null>(null);

  /**
   * The rep is standing in the shop. That is the one moment the coordinates are
   * free and certain, and typing six decimal places off a maps app afterwards is
   * how they end up on the wrong side of the road.
   */
  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError(locationProblem());
      return;
    }

    haptic("tap");
    setLocating(true);
    setLocationError(null);
    setAccuracy(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setAccuracy(formatAccuracy(position.coords.accuracy));
        haptic("success");
        set({
          latitude: formatCoordinate(position.coords.latitude),
          longitude: formatCoordinate(position.coords.longitude),
        });
      },
      (error) => {
        setLocating(false);
        haptic("error");
        setLocationError(locationProblem(error.code));
      },
      // A phone indoors takes its time, and the cached fix from an hour ago is
      // the wrong shop. Wait for a real one.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const problem = coordinateProblem(draft.latitude, draft.longitude);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field
          label="Street address"
          optional
          value={draft.street_address}
          onChange={(v) => set({ street_address: v })}
          placeholder="St 271, House 42"
          disabled={disabled}
        />
      </div>

      <SelectField
        label="Province"
        optional
        value={draft.province_code}
        onChange={(v) => set({ province_code: v })}
        options={provinces.map((p) => ({ value: p.code, label: p.name }))}
        placeholder="Not set"
        disabled={disabled}
      />

      <Field
        label="District"
        optional
        value={draft.district_text}
        onChange={(v) => set({ district_text: v })}
        placeholder="Type it"
        disabled={disabled}
      />

      <Field
        label="Commune"
        optional
        value={draft.commune_text}
        onChange={(v) => set({ commune_text: v })}
        placeholder="Type it"
        disabled={disabled}
      />

      <Field
        label="Postal code"
        optional
        inputMode="numeric"
        value={draft.zipcode}
        onChange={(v) => set({ zipcode: v })}
        placeholder="120101"
        disabled={disabled}
      />

      <div className="sm:col-span-2">
        <Field
          label="Landmark"
          optional
          value={draft.landmark}
          onChange={(v) => set({ landmark: v })}
          placeholder="Opposite the pagoda"
          hint="What you would tell a driver. Often more use than the street number."
          disabled={disabled}
        />
      </div>

      <Field
        label="Latitude"
        optional
        inputMode="numeric"
        value={draft.latitude}
        onChange={(v) => set({ latitude: v })}
        placeholder="11.556400"
        disabled={disabled}
      />
      <Field
        label="Longitude"
        optional
        inputMode="numeric"
        value={draft.longitude}
        onChange={(v) => set({ longitude: v })}
        placeholder="104.928200"
        disabled={disabled}
      />

      <div className="sm:col-span-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={disabled || locating}
          className="pressable flex min-h-10 items-center gap-1.5 rounded-xl border border-dashed border-brand/50 px-3 text-sm font-medium text-brand disabled:opacity-60"
        >
          <Icon name="bolt" className="size-4" />
          {locating ? t("customer.findingYou") : t("customer.useMyLocation")}
        </button>

        {/* The other case: the shop was added from a phone call at the office,
            or the fix landed on the wrong side of the road. Dragging a pin
            onto a roofline is something a person can do accurately from an
            armchair and cannot do at all by typing six decimal places. */}
        <LocationPicker
          disabled={disabled}
          latitude={Number.isFinite(Number(draft.latitude)) && draft.latitude.trim() !== ""
            ? Number(draft.latitude) : null}
          longitude={Number.isFinite(Number(draft.longitude)) && draft.longitude.trim() !== ""
            ? Number(draft.longitude) : null}
          onPick={(lat, lng) =>
            set({ latitude: formatCoordinate(lat), longitude: formatCoordinate(lng) })
          }
        />
        <p className="mt-1 text-xs text-muted">
          {accuracy
            ? `Taken from this device, accurate to about ${accuracy}. Check it is the shop and not the road.`
            : "Stand at the shop and tap this. Your browser will ask permission first."}
        </p>
      </div>

      {locationError && (
        <p role="alert" className="text-xs text-danger sm:col-span-2">
          {locationError}
        </p>
      )}

      {problem && (
        <p role="alert" className="text-xs text-danger sm:col-span-2">
          {problem}
        </p>
      )}
    </div>
  );
}
