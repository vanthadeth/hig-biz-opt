"use client";

import { Field, SelectField } from "@/components/ui/Field";
import { OPTION_KINDS, optionsOf, type VisitOption, type VisitOptionKind } from "@/lib/visits";

/**
 * What happened on the call.
 *
 * Nothing here is required. A rep opens this the moment they walk in, before
 * they know how it went, and a form that refuses to be left half-filled is a
 * form that gets filled with the first option in every list.
 *
 * The same four dropdowns appear on the open visit and on a correction the
 * next day, so they live in one place: two forms that drift apart are two
 * different records of the same call.
 */

export type VisitDraft = {
  visit_type_id: string | null;
  visit_status_id: string | null;
  order_status_id: string | null;
  payment_status_id: string | null;
  next_appointment: string | null;
  remarks: string | null;
};

const FIELD_OF: Record<VisitOptionKind, keyof VisitDraft> = {
  visit_type: "visit_type_id",
  visit_status: "visit_status_id",
  order_status: "order_status_id",
  payment_status: "payment_status_id",
};

/**
 * A timestamp as `<input type="datetime-local">` wants it, and back again.
 *
 * The input speaks the browser's local time with no zone on it. Everyone using
 * this app is in Cambodia on a phone set to Cambodia, so the browser's idea of
 * local and the database's idea of here are the same — but the conversion is
 * still explicit, because a next appointment that lands an hour out is a rep
 * standing outside a shut shop.
 */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export function VisitFields({
  draft,
  options,
  disabled = false,
  onChange,
}: {
  draft: VisitDraft;
  options: VisitOption[];
  disabled?: boolean;
  onChange: (next: VisitDraft) => void;
}) {
  const set = (patch: Partial<VisitDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="grid gap-3">
      {OPTION_KINDS.map(({ kind, label }) => {
        const field = FIELD_OF[kind];
        const list = optionsOf(options, kind);
        if (list.length === 0) return null;
        return (
          <SelectField
            key={kind}
            label={label}
            optional
            disabled={disabled}
            value={(draft[field] as string | null) ?? ""}
            onChange={(value) => set({ [field]: value || null } as Partial<VisitDraft>)}
            options={list.map((option) => ({ value: option.id, label: option.label }))}
          />
        );
      })}

      <div className="grid gap-1">
        <label className="text-xs font-medium text-muted" htmlFor="next-appointment">
          Next appointment <span className="font-normal">(optional)</span>
        </label>
        <input
          id="next-appointment"
          type="datetime-local"
          disabled={disabled}
          value={toLocalInput(draft.next_appointment)}
          onChange={(e) => set({ next_appointment: fromLocalInput(e.target.value) })}
          className="min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-brand disabled:opacity-60"
        />
      </div>

      <Field
        label="Remarks"
        optional
        disabled={disabled}
        value={draft.remarks ?? ""}
        onChange={(value) => set({ remarks: value || null })}
        placeholder="Anything the office should know"
      />
    </div>
  );
}
