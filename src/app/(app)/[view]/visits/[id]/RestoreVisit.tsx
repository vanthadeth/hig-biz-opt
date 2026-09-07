"use client";

import { useState } from "react";
import { useT } from "@/components/I18nProvider";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";

/**
 * Taking a cancellation back.
 *
 * Cancelling is itself one tap, which makes it as easy to get wrong as the
 * check-in it undoes — the wrong row in a list, a reason typed about a
 * different visit — and a mistake with no way back is how a rep loses an
 * afternoon's hours for good.
 *
 * It asks first, the same as cancelling does, because restoring puts hours
 * back into somebody's day and both directions deserve the same pause. What
 * comes back is the visit exactly as it was recorded: the cancelling never
 * touched the timestamps, the position or the distances, which is the whole
 * point of it being an annotation rather than a delete.
 */
export function RestoreVisit({
  busy,
  onRestore,
}: {
  busy: boolean;
  onRestore: () => void;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          haptic("tap");
          setAsking(true);
        }}
        className="pressable min-h-9 text-sm font-medium text-brand disabled:opacity-60"
      >
        {t("visit.restore")}
      </button>

      <Sheet open={asking} onClose={() => !busy && setAsking(false)} title={t("visit.restoreAsk")}>
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted">{t("visit.restoreBody")}</p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAsking(false)}
              disabled={busy}
              className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium disabled:opacity-50"
            >
              {t("visit.restoreKeep")}
            </button>
            <button
              type="button"
              onClick={onRestore}
              disabled={busy}
              className="pressable min-h-11 flex-[2] rounded-xl bg-brand text-sm font-semibold text-brand-fg disabled:opacity-50"
            >
              {busy ? t("visit.restoring") : t("visit.restoreDo")}
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
