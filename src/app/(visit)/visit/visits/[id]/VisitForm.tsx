"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { ChoicePills } from "@/components/ui/ChoicePills";
import { Field } from "@/components/ui/Field";
import { createClient } from "@/lib/supabase/client";
import { currentFix } from "@/lib/geo";
import { haptic } from "@/lib/haptics";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  VISIT_STATUSES,
  VISIT_TYPES,
  type Visit,
  type VisitOrderStatus,
  type VisitPaymentStatus,
  type VisitStatus,
  type VisitType,
} from "@/lib/visits";

type Draft = {
  visit_type: VisitType | null;
  status: VisitStatus | null;
  order_status: VisitOrderStatus | null;
  payment_status: VisitPaymentStatus | null;
  next_appointment_date: string;
  remarks: string;
};

/**
 * What happened in the shop, and the button that ends the visit.
 *
 * Two states, one form. While the visit is open the button checks out: it writes
 * the answers, the time and the place in a single update, because those are one
 * event and a record that stamps the time before the answers land would be
 * describing a visit that had not been filed yet. Afterwards, inside the 24
 * hours, the same fields save and the stamps are not sent at all — the payload
 * is built from the five editable fields, so there is nothing for the database
 * to refuse.
 */
export function VisitForm({ visit }: { visit: Visit }) {
  const router = useRouter();
  const open = visit.checked_out_at === null;

  const [draft, setDraft] = useState<Draft>({
    visit_type: visit.visit_type,
    status: visit.status,
    order_status: visit.order_status,
    payment_status: visit.payment_status,
    next_appointment_date: visit.next_appointment_date ?? "",
    remarks: visit.remarks ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };

  // Checking out is what files the record, so the four answers are required to
  // do it — `visits_closed_record_ck` says the same thing in the database. A
  // correction afterwards has no such requirement: the row is already complete.
  const answered =
    draft.visit_type !== null &&
    draft.status !== null &&
    draft.order_status !== null &&
    draft.payment_status !== null;

  async function save() {
    haptic("select");
    setBusy(true);
    setError(null);

    const record = {
      visit_type: draft.visit_type,
      status: draft.status,
      order_status: draft.order_status,
      payment_status: draft.payment_status,
      next_appointment_date: draft.next_appointment_date || null,
      remarks: draft.remarks.trim() || null,
    };

    // The stamps go in only on the way out, and only once. On a later edit this
    // object is empty, so nothing that guard_visit_edit protects is even sent.
    const stamps = open
      ? await (async () => {
          // Best effort, and never a gate: a visit with no fix is still a visit.
          const here = await currentFix();
          return {
            checked_out_at: new Date().toISOString(),
            checked_out_latitude: here?.latitude ?? null,
            checked_out_longitude: here?.longitude ?? null,
          };
        })()
      : {};

    const supabase = createClient();
    const { data, error: failed } = await supabase
      .from("visits")
      .update({ ...record, ...stamps })
      .eq("id", visit.id)
      .select("id");

    if (failed) {
      haptic("error");
      // The refusals from `guard_visit_edit` arrive as raised errors and already
      // say what is wrong in words a rep can act on, so they are shown as
      // written rather than replaced with something vaguer.
      setError(failed.message);
      setBusy(false);
      return;
    }

    // An update a policy blocks matches no rows and raises nothing. Without this
    // the form would report success for a save that never happened.
    if (!data?.length) {
      haptic("error");
      setError("That could not be saved. You may not have permission.");
      setBusy(false);
      return;
    }

    haptic("success");

    if (open) {
      // The bar's centre button reads the open visit from the layout, so it has
      // to be told the visit is closed before it can go back to "Check in".
      router.refresh();
      router.replace("/visit/home");
      return;
    }

    setSaved(true);
    setBusy(false);
    router.refresh();
  }

  return (
    <Card className="space-y-5 p-4">
      <ChoicePills
        label="Type of visit"
        value={draft.visit_type}
        onChange={(v) => set("visit_type", v)}
        options={VISIT_TYPES}
        disabled={busy}
      />

      <ChoicePills
        label="Visit status"
        value={draft.status}
        onChange={(v) => set("status", v)}
        options={VISIT_STATUSES}
        disabled={busy}
      />

      <ChoicePills
        label="Order status"
        value={draft.order_status}
        onChange={(v) => set("order_status", v)}
        options={ORDER_STATUSES}
        disabled={busy}
      />

      <ChoicePills
        label="Payment status"
        value={draft.payment_status}
        onChange={(v) => set("payment_status", v)}
        options={PAYMENT_STATUSES}
        disabled={busy}
      />

      <Field
        label="Next appointment"
        type="date"
        optional
        value={draft.next_appointment_date}
        onChange={(v) => set("next_appointment_date", v)}
        disabled={busy}
      />

      <div className="grid gap-1">
        <label htmlFor="remarks" className="text-xs font-medium text-muted">
          Remarks <span className="font-normal">(optional)</span>
        </label>
        <textarea
          id="remarks"
          rows={3}
          value={draft.remarks}
          onChange={(e) => set("remarks", e.target.value)}
          disabled={busy}
          placeholder="Anything the next visit should know"
          className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-brand disabled:opacity-60"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || (open && !answered)}
          className="pressable min-h-12 flex-1 rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
        >
          {busy ? "Saving…" : open ? "Check out" : "Save changes"}
        </button>
        {saved && (
          <span role="status" className="text-sm text-muted">
            Saved
          </span>
        )}
      </div>

      {open && !answered && (
        <p className="text-xs text-muted">
          Answer the four above to check out. They are what the visit records.
        </p>
      )}
    </Card>
  );
}
