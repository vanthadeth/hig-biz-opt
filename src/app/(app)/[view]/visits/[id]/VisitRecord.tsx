"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useI18n, useT } from "@/components/I18nProvider";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { hoursMinutes } from "@/lib/attendance";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { dayKey, longDay, timeOf } from "@/lib/time";
import {
  cancelChange,
  cancellable,
  distanceLabel,
  editWindowLeft,
  editable,
  rangeNote,
  shopNameOf,
  visitLength,
  type VisitOption,
  type VisitRow,
} from "@/lib/visits";
import { VisitFields, type VisitDraft } from "../VisitFields";
import { CancelVisit } from "./CancelVisit";

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
  const t = useT();
  const { lang } = useI18n();
  const nowMs = Date.parse(now);

  const [draft, setDraft] = useState<VisitDraft>(() => draftOf(visit));
  const [saved, setSaved] = useState<VisitDraft>(() => draftOf(visit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelled = visit.cancelled_at !== null;
  // A cancelled visit is finished being written to: what it says is why it was
  // called off, and editing it afterwards would blur that.
  const canEdit = editable(visit, nowMs) && !cancelled;
  const left = editWindowLeft(visit, nowMs);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const note = rangeNote(visit, lang);

  async function cancelVisit(reason: string) {
    setBusy(true);
    setError(null);

    const { data, error: failed } = await createClient()
      .from("visits")
      .update(cancelChange(reason))
      .eq("id", visit.id)
      .select("id");

    setBusy(false);
    if (failed || !data?.length) {
      haptic("error");
      setError(failed?.message ?? "That visit was not cancelled. You may not have permission.");
      return;
    }
    haptic("success");
    router.refresh();
  }

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
          {t("visit.allVisits")}
        </Link>
      )}

      <Card className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-subtle">
            <Icon name="pin" className="size-5 text-brand" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">
              {shopNameOf(visit, lang)}
            </h1>
            <p className="text-xs text-muted">{dayHeading(visit.checked_in_at)}</p>
          </div>
          <Chip
            tone={
              cancelled
                ? "danger"
                : visit.distance_m === null
                  ? "neutral"
                  : visit.out_of_range
                    ? "warn"
                    : "accent"
            }
          >
            {cancelled ? t("visit.cancelled") : distanceLabel(visit.distance_m, lang)}
          </Chip>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <Fact label={t("visit.arrived")} value={timeOf(visit.checked_in_at)} />
          <Fact
            label={t("visit.left")}
            value={visit.checked_out_at ? timeOf(visit.checked_out_at) : t("visit.stillOpen")}
          />
          <Fact label={t("visit.length")} value={hoursMinutes(visitLength(visit, nowMs))} />
        </dl>

        {cancelled ? (
          <p className="text-xs text-muted">
            Cancelled {visit.cancel_reason ? `— ${visit.cancel_reason}` : ""}. It
            counts towards no hours.
          </p>
        ) : (
          note && <p className="text-xs text-muted">{note}</p>
        )}

        {cancellable(visit, nowMs) && (
          <CancelVisit busy={busy} onCancel={cancelVisit} />
        )}
      </Card>

      <div className="space-y-3">
        <SectionHeader title={t("visit.record")} />

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
                {dirty ? t("visit.save") : t("visit.saved")}
              </button>
              {left !== null && (
                <p className="text-center text-xs text-muted">
                  {t("visit.editLeft", { length: hoursMinutes(left) })}
                </p>
              )}
            </>
          ) : (
            <p className="text-center text-xs text-muted">
              {cancelled ? t("visit.frozenCancelled") : t("visit.frozen")}
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
