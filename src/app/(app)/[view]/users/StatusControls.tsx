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
  formatDate,
  statusChange,
  statusProblem,
  STATUS_LABELS,
  STATUS_TONE,
  type UserRecord,
} from "@/lib/users";
import type { UserStatus } from "@/lib/access";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Suspend, discharge, or bring someone back.
 *
 * Separate from the record form on purpose. The rest of the form is corrections
 * — a phone number typed wrong, a new position — and is saved in a batch. This
 * changes whether a person is employed, so it asks for its dates, states what
 * it is about to do, and commits on its own.
 *
 * Nobody may change their own status here: a suspension is something done to
 * you, not something you do to yourself. The policy would allow it, since it
 * lets you edit your own row; this is the screen declining to offer it.
 */
export function StatusControls({
  record,
  canEdit,
  isSelf,
}: {
  record: UserRecord;
  canEdit: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<UserStatus | null>(null);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState("");
  const [on, setOn] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = target
    ? statusChange(target, { from, to, on, note })
    : null;
  const problem = change ? statusProblem(change) : null;

  function open(status: UserStatus) {
    haptic("tap");
    setTarget(status);
    setFrom(record.suspended_from ?? today());
    setTo(record.suspended_to ?? "");
    setOn(record.discharged_date ?? today());
    setNote("");
    setError(null);
  }

  async function commit() {
    if (!change || problem) return;
    setBusy(true);
    setError(null);

    // `.select()` because a refused update matches no rows and reports no
    // error: the policy's USING clause hides the row rather than rejecting the
    // statement, so without this a refused change would look like a success.
    const { data, error } = await createClient()
      .from("users")
      .update(change)
      .eq("id", record.id)
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

  const since =
    record.status === "suspended"
      ? `${formatDate(record.suspended_from)} to ${formatDate(record.suspended_to)}`
      : record.status === "discharged"
        ? formatDate(record.discharged_date)
        : null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">Employment status</h2>
        <Chip tone={STATUS_TONE[record.status]}>{STATUS_LABELS[record.status]}</Chip>
      </div>

      {since && <p className="mt-1 text-xs text-muted">{since}</p>}
      {record.status_note && (
        <p className="mt-1 text-sm text-muted">{record.status_note}</p>
      )}

      {isSelf ? (
        <p className="mt-3 text-xs text-muted">
          You cannot change your own employment status.
        </p>
      ) : (
        canEdit && (
          <div className="mt-3 flex flex-wrap gap-2">
            {record.status !== "active" && (
              <button
                type="button"
                onClick={() => open("active")}
                className="pressable flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-muted hover:text-fg"
              >
                <Icon name="check" className="size-4" />
                Reinstate
              </button>
            )}
            {record.status !== "suspended" && (
              <button
                type="button"
                onClick={() => open("suspended")}
                className="pressable flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-muted hover:text-fg"
              >
                <Icon name="calendar" className="size-4" />
                Suspend
              </button>
            )}
            {record.status !== "discharged" && (
              <button
                type="button"
                onClick={() => open("discharged")}
                className="pressable flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-danger hover:bg-danger/5"
              >
                <Icon name="logout" className="size-4" />
                Discharge
              </button>
            )}
          </div>
        )
      )}

      <Sheet
        open={target !== null}
        onClose={() => setTarget(null)}
        title={
          target === "suspended"
            ? "Suspend"
            : target === "discharged"
              ? "Discharge"
              : "Reinstate"
        }
      >
        <div className="space-y-4 px-3 pb-4 pt-1">
          <p className="text-sm text-muted">
            {target === "suspended" &&
              `${record.full_name} keeps their record but loses access for the dates below.`}
            {target === "discharged" &&
              `${record.full_name} leaves the company. Their record stays for the payroll and audit history.`}
            {target === "active" &&
              `${record.full_name} returns to active. The suspension or discharge dates are cleared.`}
          </p>

          {target === "suspended" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From" type="date" value={from} onChange={setFrom} />
              <Field label="To" type="date" value={to} onChange={setTo} />
            </div>
          )}

          {target === "discharged" && (
            <Field label="Last day" type="date" value={on} onChange={setOn} />
          )}

          <Field
            label="Note"
            optional
            value={note}
            onChange={setNote}
            placeholder="Why, for the record"
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
                target === "discharged"
                  ? "bg-danger text-danger-fg"
                  : "bg-brand text-brand-fg"
              }`}
            >
              {busy
                ? "Saving…"
                : target === "suspended"
                  ? "Suspend"
                  : target === "discharged"
                    ? "Discharge"
                    : "Reinstate"}
            </button>
          </div>
        </div>
      </Sheet>
    </Card>
  );
}
