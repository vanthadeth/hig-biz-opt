"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { itemStatusAction } from "@/lib/inventory";

/**
 * Take an item out of the catalogue, or bring it back.
 *
 * Deliberately not a checkbox on the item form. That form is corrections — a
 * price typed wrong, a Khmer name added — saved in a batch, where a stray click
 * on a checkbox is easy and unnoticed. Withdrawing an item stops anybody
 * selling it, so it gets a button that says what it is about to do and commits
 * on its own.
 *
 * The same shape as the status card on a customer record, for the same reasons.
 */
export function ItemStatusControls({
  itemId,
  name,
  active,
  canEdit,
}: {
  itemId: string;
  name: string;
  active: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const action = itemStatusAction(active);

  async function commit() {
    setBusy(true);
    setError(null);

    // `.select()` because a refused update matches no rows and reports no
    // error: the policy's USING clause hides the row rather than rejecting the
    // statement, so without this a refused change would look like a success.
    const { data, error } = await createClient()
      .from("items")
      .update({ active: !active })
      .eq("id", itemId)
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
    setAsking(false);
    router.refresh();
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">Status</h2>
        <Chip tone={active ? "accent" : "warn"}>{active ? "Active" : "Inactive"}</Chip>
      </div>

      <p className="mt-1 text-sm text-muted">
        {active
          ? "In the catalogue and available to sell."
          : "Out of the catalogue. Nothing already recorded against it changes."}
      </p>

      {canEdit ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setError(null);
              setAsking(true);
            }}
            className={`pressable flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium ${
              action.danger ? "text-danger hover:bg-danger/5" : "text-muted hover:text-fg"
            }`}
          >
            <Icon name={action.icon} className="size-4" />
            {action.label}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Changing this needs the Inventory module at edit level.
        </p>
      )}

      <Sheet open={asking} onClose={() => setAsking(false)} title={action.label}>
        <div className="space-y-4 px-3 pb-4 pt-1">
          <p className="text-sm text-muted">{action.describe(name)}</p>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAsking(false)}
              disabled={busy}
              className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium text-muted disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={busy}
              className={`pressable min-h-11 flex-1 rounded-xl text-sm font-medium disabled:opacity-60 ${
                action.danger ? "bg-danger text-danger-fg" : "bg-brand text-brand-fg"
              }`}
            >
              {busy ? "Saving…" : action.label}
            </button>
          </div>
        </div>
      </Sheet>
    </Card>
  );
}
