"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { haptic } from "@/lib/haptics";
import { passwordProblem, PASSWORD_MIN } from "@/lib/passwords";
import { createClient } from "@/lib/supabase/client";

/**
 * Changing your own password, here, without an email round trip.
 *
 * The reset link beside this is still the right thing when somebody is locked
 * out. This is for the other case, which is the common one: a rep was handed a
 * temporary password an hour ago and wants their own. Sending them to a mailbox
 * for that — on a phone, in a shop, possibly on an account whose email is a
 * shared office one — is a good way to have the temporary password kept
 * forever.
 *
 * Supabase requires a live session to change a password, so this cannot be used
 * by somebody who is merely near an unlocked phone... which is exactly what
 * somebody near an unlocked phone is. That is the honest limit of it, and it is
 * why the PIN and the sign-out button both exist.
 */
export function ChangePassword() {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    const problem = passwordProblem(password, again);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    const { error: e } = await createClient().auth.updateUser({ password });
    setBusy(false);

    if (e) {
      haptic("error");
      setError(e.message);
      return;
    }

    haptic("success");
    setDone(true);
    setPassword("");
    setAgain("");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {done
          ? "Saved. Use the new one next time you sign in."
          : `At least ${PASSWORD_MIN} characters. Changing it here signs nobody out.`}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="New password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setDone(false);
            setError(null);
          }}
          type="password"
          autoComplete="new-password"
        />
        <Field
          label="Again"
          value={again}
          onChange={(v) => {
            setAgain(v);
            setDone(false);
            setError(null);
          }}
          type="password"
          autoComplete="new-password"
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
        disabled={busy || password === ""}
        className="pressable min-h-11 w-full rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
      >
        {busy ? "Saving…" : "Change password"}
      </button>
    </div>
  );
}
