"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sheet } from "@/components/ui/Sheet";
import { hoursMinutes } from "@/lib/attendance";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { timeOf } from "@/lib/time";
import { distanceLabel, rangeNote, shopNameOf, visitLength, type VisitOption, type VisitRow } from "@/lib/visits";
import { useFix } from "../useFix";
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
 * The shop somebody is standing in.
 *
 * Three parts, top to bottom, because that is the order a rep uses them: when
 * they arrived and how far off the fix was; what happened on the call; and the
 * way out. The way out is pinned to the bottom of the screen rather than
 * scrolled to, so a call that ends suddenly — the owner walks off, the phone
 * is about to die — is one tap from being closed properly.
 *
 * Checking out asks first. It is the one irreversible thing on the screen: the
 * time it writes can never be changed afterwards, by anybody, and a thumb
 * resting on the bottom of a phone is exactly where an accidental tap lands.
 */
export function OpenVisitPage({
  viewKey,
  visit,
  options,
  now,
}: {
  viewKey: string;
  visit: VisitRow;
  options: VisitOption[];
  now: string;
}) {
  const router = useRouter();
  const { fix, problem } = useFix();

  const [nowMs, setNowMs] = useState(() => Date.parse(now));
  const [draft, setDraft] = useState<VisitDraft>(() => draftOf(visit));
  const [saved, setSaved] = useState<VisitDraft>(() => draftOf(visit));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const note = rangeNote(visit);

  // A minute is enough: the time is shown to the minute, and a ticking second
  // hand on a page somebody is typing into is a distraction.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  /** Returns whether the record is now safely in the database. */
  async function saveRecord(): Promise<boolean> {
    if (!dirty) return true;

    // `.select()` because a refused update matches no rows and reports no
    // error: the policy hides the row rather than rejecting the statement, so
    // without this a refused change would look like a success.
    const { data, error: failed } = await createClient()
      .from("visits")
      .update(draft)
      .eq("id", visit.id)
      .select("id");

    if (failed || !data?.length) {
      haptic("error");
      setError(failed?.message ?? "That change was not saved. You may not have permission.");
      return false;
    }
    setSaved(draft);
    return true;
  }

  async function save() {
    setBusy(true);
    setError(null);
    const ok = await saveRecord();
    setBusy(false);
    if (ok) {
      haptic("success");
      router.refresh();
    }
  }

  async function checkOut() {
    setBusy(true);
    setError(null);

    // The record first. Checking out closes the visit, and anything typed but
    // unsaved at that moment would be a note about a call nobody can find.
    if (!(await saveRecord())) {
      setBusy(false);
      setAsking(false);
      return;
    }

    const { error: failed } = await createClient().rpc("check_out", {
      p_visit: visit.id,
      p_latitude: fix?.latitude ?? null,
      p_longitude: fix?.longitude ?? null,
    });

    setBusy(false);
    setAsking(false);
    if (failed) {
      haptic("error");
      setError(failed.message);
      return;
    }
    haptic("success");
    router.push(`/${viewKey}/visits`);
  }

  const shopName = shopNameOf(visit);

  return (
    <div className="space-y-5">
      <Link
        href={`/${viewKey}/visits`}
        className="pressable inline-flex min-h-9 items-center gap-1 text-sm text-muted"
      >
        <Icon name="chevron" className="size-4 rotate-180" />
        All visits
      </Link>

      {/* When you arrived ------------------------------------------------- */}
      <Card className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-fg">
            <Icon name="pin" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{shopName}</h1>
            <p className="text-xs text-muted">Checked in</p>
          </div>
          <Chip tone={visit.out_of_range ? "warn" : "accent"}>
            {distanceLabel(visit.distance_m)}
          </Chip>
        </div>

        <div className="flex items-end gap-3">
          <p className="text-3xl font-semibold tabular-nums text-brand">
            {timeOf(visit.checked_in_at)}
          </p>
          <p className="pb-1 text-sm text-muted">
            {hoursMinutes(visitLength(visit, nowMs))} ago
          </p>
        </div>

        {note && <p className="text-xs text-muted">{note}</p>}
        {problem && <p className="text-xs text-muted">{problem}</p>}
      </Card>

      {/* What happened ---------------------------------------------------- */}
      <div className="space-y-3">
        <SectionHeader title="Visit record" />

        {error && (
          <div role="alert">
            <Card className="border-danger/40 bg-danger/5 p-3 text-sm text-danger">
              {error}
            </Card>
          </div>
        )}

        <Card className="space-y-4 p-4">
          <VisitFields draft={draft} options={options} disabled={busy} onChange={setDraft} />

          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className="pressable min-h-11 w-full rounded-xl border border-line text-sm font-medium disabled:opacity-50"
          >
            {dirty ? "Save" : "Saved"}
          </button>
        </Card>
      </div>

      {/* The way out ------------------------------------------------------ */}
      {/* Above the bottom bar on a phone, at the foot of the page from md up
          where there is no bottom bar to clear. */}
      <div className="sticky bottom-20 z-30 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-2 md:mx-0 md:rounded-2xl md:border">
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setAsking(true);
          }}
          disabled={busy}
          className="pressable min-h-12 w-full rounded-xl bg-brand text-base font-semibold text-brand-fg disabled:opacity-60"
        >
          Check out
        </button>
      </div>

      <Sheet open={asking} onClose={() => !busy && setAsking(false)} title="Check out?">
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted">
            This closes the visit to {shopName}, {hoursMinutes(visitLength(visit, nowMs))}{" "}
            after checking in. The time it writes cannot be changed afterwards.
            {dirty && " Anything you have typed will be saved first."}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAsking(false)}
              disabled={busy}
              className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium disabled:opacity-50"
            >
              Not yet
            </button>
            <button
              type="button"
              onClick={checkOut}
              disabled={busy}
              className="pressable min-h-11 flex-[2] rounded-xl bg-brand text-sm font-semibold text-brand-fg disabled:opacity-60"
            >
              {busy ? "Checking out…" : "Check out"}
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
