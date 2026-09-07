"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { haptic } from "@/lib/haptics";
import { hoursMinutes } from "@/lib/attendance";
import { createClient } from "@/lib/supabase/client";
import { timeOf } from "@/lib/time";
import {
  distanceLabel,
  rangeNote,
  visitLength,
  type Fix,
  type VisitOption,
  type VisitRow,
} from "@/lib/visits";
import { VisitFields, type VisitDraft } from "./VisitFields";

const draftOf = (visit: VisitRow): VisitDraft => ({
  visit_type_id: visit.visit_type_id,
  visit_status_id: visit.visit_status_id,
  order_status_id: visit.order_status_id,
  payment_status_id: visit.payment_status_id,
  next_appointment: visit.next_appointment,
  remarks: visit.remarks,
});

/**
 * The shop somebody is standing in.
 *
 * Mounted under the visit's own id as a key, so a different visit gets a
 * different component rather than this one resetting its form in an effect —
 * which is the same thing said properly, and does not fight the compiler.
 *
 * What is typed here survives a refresh of the page around it: the draft
 * belongs to this component, and `router.refresh()` re-renders the list above
 * without touching it. That matters because a rep types the remarks while the
 * phone is doing other things.
 */
export function OpenVisit({
  visit,
  options,
  fix,
  nowMs,
  onChanged,
  onProblem,
}: {
  visit: VisitRow;
  options: VisitOption[];
  fix: Fix | null;
  nowMs: number;
  onChanged: () => void;
  onProblem: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState<VisitDraft>(() => draftOf(visit));
  const [saved, setSaved] = useState<VisitDraft>(() => draftOf(visit));
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const note = rangeNote(visit);

  /** Returns whether the record is now safely in the database. */
  async function saveRecord(): Promise<boolean> {
    if (!dirty) return true;

    // `.select()` because a refused update matches no rows and reports no
    // error: the policy hides the row rather than rejecting the statement, so
    // without this a refused change would look like a success.
    const { data, error } = await createClient()
      .from("visits")
      .update(draft)
      .eq("id", visit.id)
      .select("id");

    if (error || !data?.length) {
      haptic("error");
      onProblem(error?.message ?? "That change was not saved. You may not have permission.");
      return false;
    }
    setSaved(draft);
    return true;
  }

  async function save() {
    setBusy(true);
    onProblem(null);
    const ok = await saveRecord();
    setBusy(false);
    if (ok) {
      haptic("success");
      onChanged();
    }
  }

  async function checkOut() {
    setBusy(true);
    onProblem(null);

    // The record first. Checking out closes the visit, and anything typed but
    // unsaved at that moment would be a note about a call nobody can find.
    if (!(await saveRecord())) {
      setBusy(false);
      return;
    }

    const { error } = await createClient().rpc("check_out", {
      p_visit: visit.id,
      p_latitude: fix?.latitude ?? null,
      p_longitude: fix?.longitude ?? null,
    });

    setBusy(false);
    if (error) {
      haptic("error");
      onProblem(error.message);
      return;
    }
    haptic("success");
    onChanged();
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-fg">
          <Icon name="pin" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">
            {visit.customer?.shop_name ?? "Shop removed"}
          </p>
          <p className="text-xs text-muted">
            Checked in {timeOf(visit.checked_in_at)} ·{" "}
            {hoursMinutes(visitLength(visit, nowMs))} so far
          </p>
        </div>
        <Chip tone={visit.out_of_range ? "warn" : "accent"}>
          {distanceLabel(visit.distance_m)}
        </Chip>
      </div>

      {note && <p className="text-xs text-muted">{note}</p>}

      <VisitFields draft={draft} options={options} disabled={busy} onChange={setDraft} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium disabled:opacity-50"
        >
          {dirty ? "Save" : "Saved"}
        </button>
        <button
          type="button"
          onClick={checkOut}
          disabled={busy}
          className="pressable min-h-11 flex-[2] rounded-xl bg-brand text-sm font-semibold text-brand-fg disabled:opacity-60"
        >
          Check out
        </button>
      </div>
    </Card>
  );
}
