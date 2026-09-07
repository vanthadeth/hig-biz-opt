"use client";

import { useState } from "react";
import { useT } from "@/components/I18nProvider";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { cancelProblem } from "@/lib/visits";

/**
 * Calling a visit off.
 *
 * The check-in fires on one tap, which is what makes the recorded time honest
 * and also what makes mistakes possible: a pocket tap, the wrong shop, a call
 * abandoned at the door. This is the remedy, and it is an annotation rather
 * than a delete — the row keeps both its timestamps and its position, and
 * simply stops counting towards anybody's hours.
 *
 * The reason is required. "Cancelled" on its own cannot be told apart from a
 * second mistake, and the next person to read the record has to be able to.
 */
export function CancelVisit({
  busy,
  onCancel,
}: {
  busy: boolean;
  onCancel: (reason: string) => void;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  const problem = cancelProblem(reason);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          haptic("tap");
          setReason("");
          setAsking(true);
        }}
        className="pressable min-h-9 text-sm font-medium text-danger disabled:opacity-60"
      >
        {t("visit.cancel")}
      </button>

      <Sheet open={asking} onClose={() => !busy && setAsking(false)} title={t("visit.cancelAsk")}>
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted">
            {t("visit.cancelBody")}
          </p>

          <Field
            label={t("visit.cancelWhy")}
            value={reason}
            onChange={setReason}
            disabled={busy}
            placeholder={t("visit.cancelPlaceholder")}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAsking(false)}
              disabled={busy}
              className="pressable min-h-11 flex-1 rounded-xl border border-line text-sm font-medium disabled:opacity-50"
            >
              {t("visit.cancelKeep")}
            </button>
            <button
              type="button"
              onClick={() => onCancel(reason)}
              disabled={busy || problem !== null}
              className="pressable min-h-11 flex-[2] rounded-xl bg-danger text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? t("visit.cancelling") : t("visit.cancelDo")}
            </button>
          </div>

          {reason.trim() !== "" && problem && (
            <p role="alert" className="text-xs text-danger">{problem}</p>
          )}
        </div>
      </Sheet>
    </>
  );
}
