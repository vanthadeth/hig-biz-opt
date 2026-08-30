"use client";

import { Field, SelectField } from "@/components/ui/Field";
import {
  communesIn,
  coordinateProblem,
  districtsIn,
  type Commune,
  type District,
  type Province,
} from "@/lib/customers";

export type AddressDraft = {
  street_address: string;
  province_code: string;
  district_code: string;
  commune_code: string;
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
 * Province, district and commune are *chosen* from the reference tables when
 * they have been imported, and typed when they have not. That is not a
 * compromise, it is the requirement: HIG sells into places whose commune may
 * not be in any dataset yet, and a rep standing in the shop cannot wait for one.
 *
 * So each level offers a select over what is known, plus a text box that takes
 * over when the select has nothing to offer. Picking a district fills in its
 * province — a trigger in the database does the same, so the two cannot drift.
 */
export function AddressFields({
  draft,
  provinces,
  districts,
  communes,
  disabled,
  onChange,
}: {
  draft: AddressDraft;
  provinces: Province[];
  districts: District[];
  communes: Commune[];
  disabled: boolean;
  onChange: (next: AddressDraft) => void;
}) {
  const set = (changes: Partial<AddressDraft>) => onChange({ ...draft, ...changes });

  const districtChoices = draft.province_code
    ? districtsIn(districts, draft.province_code)
    : [];
  const communeChoices = draft.district_code
    ? communesIn(communes, draft.district_code)
    : [];

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
        onChange={(v) =>
          // Changing the province invalidates everything under it.
          set({ province_code: v, district_code: "", commune_code: "", district_text: "", commune_text: "" })
        }
        options={provinces.map((p) => ({ value: p.code, label: p.name_en }))}
        placeholder="Not set"
        disabled={disabled}
      />

      {districtChoices.length > 0 ? (
        <SelectField
          label="District"
          optional
          value={draft.district_code}
          onChange={(v) => set({ district_code: v, commune_code: "", commune_text: "" })}
          options={districtChoices.map((d) => ({ value: d.code, label: d.name_en }))}
          placeholder="Not set"
          disabled={disabled}
        />
      ) : (
        <Field
          label="District"
          optional
          value={draft.district_text}
          onChange={(v) => set({ district_text: v })}
          placeholder="Type it"
          hint={
            draft.province_code
              ? "No districts imported for this province yet."
              : undefined
          }
          disabled={disabled}
        />
      )}

      {communeChoices.length > 0 ? (
        <SelectField
          label="Commune"
          optional
          value={draft.commune_code}
          onChange={(v) => set({ commune_code: v })}
          options={communeChoices.map((c) => ({ value: c.code, label: c.name_en }))}
          placeholder="Not set"
          disabled={disabled}
        />
      ) : (
        <Field
          label="Commune"
          optional
          value={draft.commune_text}
          onChange={(v) => set({ commune_text: v })}
          placeholder="Type it"
          disabled={disabled}
        />
      )}

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

      {problem && (
        <p role="alert" className="text-xs text-danger sm:col-span-2">
          {problem}
        </p>
      )}
    </div>
  );
}
