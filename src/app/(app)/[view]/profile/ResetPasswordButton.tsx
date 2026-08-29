"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { haptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";

type State = "idle" | "sending" | "sent" | "failed";

/**
 * Sends a password reset link to your own address.
 *
 * A link rather than an in-page form: changing a password should require proving
 * you still hold the mailbox, not merely that a session was left open on a phone
 * somebody borrowed.
 *
 * With no email on the record there is nowhere to send it, so the button says
 * that instead of failing after a tap. That case is real — the user model makes
 * email optional, and someone can hold a record without one.
 */
export function ResetPasswordButton({ email }: { email: string | null }) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    if (!email) return;
    setState("sending");
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      haptic("error");
      setState("failed");
      setMessage(error.message);
      return;
    }

    haptic("success");
    setState("sent");
  }

  if (!email) {
    return (
      <p className="text-sm text-muted">
        Add an email address to your record to be able to reset your password.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={send}
        disabled={state === "sending" || state === "sent"}
        className="pressable inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-fg disabled:opacity-60"
      >
        <Icon name="mail" className="size-4.5" />
        {state === "sending" ? "Sending…" : "Reset password"}
      </button>

      {state === "sent" && (
        <p role="status" className="text-sm text-muted">
          A reset link is on its way to {email}.
        </p>
      )}
      {state === "failed" && message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
