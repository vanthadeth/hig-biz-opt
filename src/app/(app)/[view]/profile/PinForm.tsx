"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { haptic } from "@/lib/haptics";
import { isPinShaped } from "@/lib/kiosk";
import { createClient } from "@/lib/supabase/client";

/**
 * Setting the PIN that ends catalogue browsing.
 *
 * Typed twice, because a PIN nobody can remember is not recoverable from here:
 * the hash is all the database keeps, and getting it wrong means being stuck
 * behind the lock until somebody sets a new one.
 *
 * A form and not a card: the sheet that opens it carries the heading, and two
 * headings for one thing is one too many.
 */
export function PinForm({ isSet }: { isSet: boolean }) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    if (!isPinShaped(pin)) {
      setError("A PIN is four digits.");
      return;
    }
    if (pin !== again) {
      setError("Those two do not match.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { error: e } = await createClient().rpc("set_my_pin", { p_pin: pin });
      if (e) throw new Error(e.message);
      haptic("success");
      setDone(true);
      setPin("");
      setAgain("");
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The PIN could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {done
          ? "Saved. Use it to unlock after handing the phone over."
          : isSet
            ? "A PIN is set on this account. Typing a new one replaces it."
            : "No PIN yet. Set one before handing your phone to anybody — without it, catalogue browsing cannot be ended on this device."}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Four digits"
          value={pin}
          onChange={(v) => {
            setPin(v.replace(/\D/g, "").slice(0, 4));
            setDone(false);
          }}
          inputMode="numeric"
          type="text"
          autoComplete="off"
        />
        <Field
          label="Again"
          value={again}
          onChange={(v) => {
            setAgain(v.replace(/\D/g, "").slice(0, 4));
            setDone(false);
          }}
          inputMode="numeric"
          type="text"
          autoComplete="off"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving || pin === ""}
        className="pressable min-h-11 w-full rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
      >
        {saving ? "Saving…" : isSet ? "Replace PIN" : "Set PIN"}
      </button>
    </div>
  );
}
