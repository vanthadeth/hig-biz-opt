"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_TONE,
  statusAction,
  statusActions,
  statusChange,
  statusProblem,
  type CustomerStatus,
} from "@/lib/customers";

/**
 * Make a shop inactive, ban it, or bring it back.
 *
 * Deliberately not a field on the customer form. The rest of that form is
 * corrections — a phone number typed wrong, a landmark that has moved — saved
 * in a batch, where a stray click on a select is easy and unnoticed. Banning a
 * shop stops anybody selling to it and has to be answerable a year later, so it
 * gets a button that says what it is about to do, asks for the reason the CHECK
 * constraint will demand anyway, and commits on its own.
 *
 * The same shape as the employment-status card on a user record, for the same
 * reasons.
 */
export function CustomerStatusControls({
  customerId,
  shopName,
  status,
  statusNote,
  canEdit,
}: {
  customerId: string;
  shopName: string;
  status: CustomerStatus;
  statusNote: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<CustomerStatus | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const action = target ? statusAction(target) : null;
  const problem = target ? statusProblem(target, note) : null;

  function open(next: CustomerStatus) {
    haptic("tap");
    setTarget(next);
    setNote("");
    setError(null);
  }

  async function commit() {
    if (!target || problem) return;
    setBusy(true);
    setError(null);

    // `.select()` because a refused update matches no rows and reports no
    // error: the policy's USING clause hides the row rather than rejecting the
    // statement, so without this a refused change would look like a success.
    const { data, error } = await createClient()
      .from("customers")
      .update(statusChange(target, note))
      .eq("id", customerId)
      .select("id");

    setBusy(false);
    if (error || !data?.length) {
      haptic("error");
      setError(
        error?.message ?? "That change could not be saved. You may not have permission.",
      );
      return;
    }

    haptic("success");
    setTarget(null);
    router.refresh();
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">Status</h2>
        <Chip tone={CUSTOMER_STATUS_TONE[status]}>
          {CUSTOMER_STATUS_LABELS[status]}
        </Chip>
      </div>

      {statusNote && <p className="mt-1 text-sm text-muted">{statusNote}</p>}

      {canEdit ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {statusActions(status).map((option) => (
            <button
              key={option.target}
              type="button"
              onClick={() => open(option.target)}
              className={`pressable flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium ${
                option.danger
                  ? "text-danger hover:bg-danger/5"
                  : "text-muted hover:text-fg"
              }`}
            >
              <Icon name={option.icon} className="size-4" />
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Changing this needs the Customer module at update level.
        </p>
      )}

      <Sheet
        open={target !== null}
        onClose={() => setTarget(null)}
        title={action?.label ?? "Change status"}
      >
        {action && (
          <div className="space-y-4 px-3 pb-4 pt-1">
            <p className="text-sm text-muted">{action.describe(shopName)}</p>

            <Field
              label={action.needsReason ? "Reason" : "Note"}
              optional={!action.needsReason}
              value={note}
              onChange={setNote}
              placeholder={
                action.needsReason ? "Cheques returned twice" : "Why, for the record"
              }
              hint={
                action.target === "active"
                  ? "Any earlier reason is cleared, so nothing stale is left on the record."
                  : undefined
              }
            />

            {problem && <p className="text-sm text-danger">{problem}</p>}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTarget(null)}
                disabled={busy}
                className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium text-muted disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={busy || problem !== null}
                className={`pressable min-h-11 flex-1 rounded-xl text-sm font-medium disabled:opacity-60 ${
                  action.danger
                    ? "bg-danger text-danger-fg"
                    : "bg-brand text-brand-fg"
                }`}
              >
                {busy ? "Saving…" : action.label}
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </Card>
  );
}
