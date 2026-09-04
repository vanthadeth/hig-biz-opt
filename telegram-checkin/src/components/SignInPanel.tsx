"use client";

import { useState } from "react";

/**
 * Shown once, on the first launch from a Telegram account nobody has claimed.
 *
 * Asking for a password inside Telegram is a real cost, so it is paid exactly
 * once: the handler writes the Telegram account onto the employee record, and
 * every later launch is silent.
 */
export function SignInPanel({
  initData,
  onLinked,
}: {
  initData: string;
  onLinked: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = busy || email.trim() === "" || password === "";

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/telegram/bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData, email: email.trim(), password }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "That did not work. Try again.");
        return;
      }
      onLinked();
    } catch {
      setError("No connection. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fade-up rounded-2xl bg-surface p-5">
      <h2 className="text-base font-semibold">Link your account</h2>
      <p className="mt-1 text-sm text-muted">
        Sign in once with your HIG email and password. After this, opening the app is
        enough.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-sm text-muted">Email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-brand"
          />
        </label>

        <label className="block">
          <span className="text-sm text-muted">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-brand"
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={blocked}
        className="pressable mt-4 w-full rounded-xl bg-brand px-4 py-3 text-base font-semibold text-brand-fg disabled:opacity-50"
      >
        {busy ? "Linking…" : "Link and continue"}
      </button>
    </section>
  );
}
