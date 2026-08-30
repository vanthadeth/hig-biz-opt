"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";

/**
 * Deletes an employee record for good.
 *
 * Deliberately awkward. Someone leaving the company is a discharge, which keeps
 * the record and its payroll history; deleting is for a record that should
 * never have existed — a duplicate, a test row, a name typed into the wrong
 * form. The sheet says so, and asks for the name to be typed, because the two
 * are one tap apart on a phone and only one of them is reversible.
 *
 * Their login, if they have one, is not deleted: that needs the admin API and a
 * service key, which no browser should hold. The sheet says that too rather
 * than leaving someone to assume access is gone.
 */
export function RemoveUserButton({
  userId,
  fullName,
  viewKey,
}: {
  userId: string;
  fullName: string;
  viewKey: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = typed.trim().toLowerCase() === fullName.trim().toLowerCase();

  function close() {
    setOpen(false);
    setTyped("");
    setError(null);
  }

  async function remove() {
    if (!confirmed) return;
    setBusy(true);
    setError(null);

    // `.select()` for the same reason every other write here has it: a delete
    // the policy refuses matches no rows and reports no error at all.
    const { data, error } = await createClient()
      .from("users")
      .delete()
      .eq("id", userId)
      .select("id");

    if (error || !data?.length) {
      haptic("error");
      setError(
        error?.message ?? "That record could not be removed. You may not have permission.",
      );
      setBusy(false);
      return;
    }

    haptic("success");
    router.replace(`/${viewKey}/users`);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          setOpen(true);
        }}
        className="pressable flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-danger hover:bg-danger/5"
      >
        <Icon name="trash" className="size-4" />
        Remove
      </button>

      <Sheet open={open} onClose={close} title="Remove this record">
        <div className="space-y-4 px-3 pb-4 pt-1">
          <p className="text-sm">
            This deletes {fullName}&rsquo;s record permanently, along with their
            photo, permission overrides and view assignments. It cannot be undone.
          </p>
          <p className="text-sm text-muted">
            If they have left the company, use <strong>Discharge</strong> instead —
            that keeps the record for payroll and audit history. Removing is for a
            record that should not exist: a duplicate, or a name typed in error.
          </p>
          <p className="text-sm text-muted">
            Their login, if they have one, is not deleted here and has to be
            removed in Supabase.
          </p>

          <Field
            label="Type their full name to confirm"
            value={typed}
            onChange={setTyped}
            placeholder={fullName}
            autoComplete="off"
          />

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium text-muted disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={!confirmed || busy}
              className="pressable min-h-11 flex-1 rounded-xl bg-danger text-sm font-medium text-danger-fg disabled:opacity-60"
            >
              {busy ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
