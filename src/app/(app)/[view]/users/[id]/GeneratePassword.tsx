"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { CopyField } from "@/components/ui/CopyField";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { haptic } from "@/lib/haptics";

/**
 * Giving somebody a login, or a new password for the one they have.
 *
 * Shown to a super admin only, because the route behind it holds the key that
 * bypasses every policy in the database. The route checks that itself — this
 * only decides whether to draw the card.
 *
 * The password appears once. It is not stored anywhere and cannot be shown
 * again, which is said on the card rather than discovered: somebody who closes
 * the page before copying it has to generate another one, and that is a
 * different password.
 */
export function GeneratePassword({
  userId,
  email,
  name,
}: {
  userId: string;
  email: string | null;
  name: string;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}/password`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The password could not be set.");

      haptic("success");
      setPassword(body.password as string);
      setCreated(body.created === true);
    } catch (e) {
      haptic("error");
      setError(e instanceof Error ? e.message : "The password could not be set.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <SectionHeader
        title="Password"
        caption={`Give ${name} a login, or replace the password on the one they have.`}
      />

      {!email ? (
        <p className="text-sm text-muted">
          This record has no email address, so there is nothing to sign in with.
          Add one first.
        </p>
      ) : (
        <>
          {password ? (
            <div className="space-y-2">
              <p className="text-sm">
                {created ? "Login created for " : "New password for "}
                <span className="font-medium">{email}</span>.
              </p>
              <CopyField value={password} label="temporary password" />
              <p className="text-xs text-muted">
                Shown once and stored nowhere. Send it to {name} yourself — this
                app will not email it — and have them change it from their
                profile.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Signs in as <span className="font-medium">{email}</span>.
            </p>
          )}

          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="pressable min-h-11 w-full rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
          >
            {busy
              ? "Generating…"
              : password
                ? "Generate another"
                : "Generate a password"}
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
