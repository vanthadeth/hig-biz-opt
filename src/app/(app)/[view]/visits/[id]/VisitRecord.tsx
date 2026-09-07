"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { hoursMinutes } from "@/lib/attendance";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { dayKey, longDay, timeOf } from "@/lib/time";
import {
  distanceLabel,
  editWindowLeft,
  editable,
  rangeNote,
  visitLength,
  type VisitOption,
  type VisitRow,
} from "@/lib/visits";
import { VisitFields, type VisitDraft } from "../VisitFields";

const draftOf = (visit: VisitRow): VisitDraft => ({
  visit_type_id: visit.visit_type_id,
  visit_status_id: visit.visit_status_id,
  order_status_id: visit.order_status_id,
  payment_status_id: visit.payment_status_id,
  next_appointment: visit.next_appointment,
  remarks: visit.remarks,
});

/**
 * A visit, and the day somebody has to correct it.
 *
 * The two timestamps and the distance are shown but never offered for editing,
 * because the database refuses to change them and a form that lets somebody
 * type into a field it cannot save is a form that lies. What is left — what
 * kind of call it was, whether an order came of it, when to come back — stays
 * open for twenty-four hours after the check-out, because people write "no
 * order" and then get one an hour later.
 *
 * When that day is up the fields go read-only here as well. The database is
 * still what enforces it; this only saves somebody typing for a minute before
 * being told.
 */
export function VisitRecord({
  viewKey = "",
  visit,
  options,
  now,
}: {
  viewKey?: string;
  visit: VisitRow;
  options: VisitOption[];
  now: string;
}) {
  const router = useRouter();
  const nowMs = Date.parse(now);

  const [draft, setDraft] = useState<VisitDraft>(() => draftOf(visit));
  const [saved, setSaved] = useState<VisitDraft>(() => draftOf(visit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit = editable(visit, nowMs);
  const left = editWindowLeft(visit, nowMs);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const note = rangeNote(visit);

  async function save() {
    setBusy(true);
    setError(null);

    // `.select()` because a refused update matches no rows and reports no
    // error — and here the refusal may come from the guard trigger instead, so
    // both shapes have to be handled.
    const { data, error: failed } = await createClient()
      .from("visits")
      .update(draft)
      .eq("id", visit.id)
      .select("id");

    setBusy(false);
    if (failed || !data?.length) {
      haptic("error");
      setError(
        failed?.message ?? "That change was not saved. You may not have permission.",
      );
      return;
    }
    haptic("success");
    setSaved(draft);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {viewKey && (
        <Link
          href={`/${viewKey}/visits`}
          className="pressable inline-flex min-h-9 items-center gap-1 text-sm text-muted"
        >
          <Icon name="chevron" className="size-4 rotate-180" />
          All visits
        </Link>
      )}

      <Card className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-subtle">
            <Icon name="pin" className="size-5 text-brand" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">
              {visit.customer?.shop_name ?? "Shop removed"}
            </h1>
            <p className="text-xs text-muted">{dayHeading(visit.checked_in_at)}</p>
          </div>
          <Chip tone={visit.out_of_range ? "warn" : "accent"}>
            {distanceLabel(visit.distance_m)}
          </Chip>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <Fact label="Arrived" value={timeOf(visit.checked_in_at)} />
          <Fact
            label="Left"
            value={visit.checked_out_at ? timeOf(visit.checked_out_at) : "Still open"}
          />
          <Fact label="Length" value={hoursMinutes(visitLength(visit, nowMs))} />
        </dl>

        {note && <p className="text-xs text-muted">{note}</p>}
      </Card>

      <div className="space-y-3">
        <SectionHeader title="The record" />

        {error && (
          <div role="alert">
            <Card className="border-danger/40 bg-danger/5 p-3 text-sm text-danger">
              {error}
            </Card>
          </div>
        )}

        <Card className="space-y-4 p-4">
          <VisitFields
            draft={draft}
            options={options}
            disabled={!canEdit || busy}
            onChange={setDraft}
          />

          {canEdit ? (
            <>
              <button
                type="button"
                onClick={save}
                disabled={busy || !dirty}
                className="pressable min-h-11 w-full rounded-xl bg-brand text-sm font-semibold text-brand-fg disabled:opacity-50"
              >
                {dirty ? "Save" : "Saved"}
              </button>
              {left !== null && (
                <p className="text-center text-xs text-muted">
                  {hoursMinutes(left)} left to correct this.
                </p>
              )}
            </>
          ) : (
            <p className="text-center text-xs text-muted">
              This visit closed more than a day ago. What it says is now the record.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-subtle p-2">
      <dt className="whitespace-nowrap text-xs text-muted">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function dayHeading(iso: string): string {
  return longDay(dayKey(iso));
}
