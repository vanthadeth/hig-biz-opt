"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { isPinShaped } from "@/lib/kiosk";

/**
 * The way out of kiosk mode, and the only one.
 *
 * It sits at the top of the catalogue because that is the one page a locked
 * device can be on. Everything else redirects here, so a button anywhere else
 * would be a button nobody could reach.
 *
 * Deliberately plain about what it is: a customer holding the phone should be
 * able to tell that this is the shop's app in a browsing mode, not a locked
 * device they have broken.
 */
export function KioskBar() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Unknown until asked. A device locked before the app started insisting on a
  // PIN can still be sitting here with no way to type one, and drawing a keypad
  // at somebody who has nothing to enter is how a lock becomes a trap.
  const [pinSet, setPinSet] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open || pinSet !== null) return;
    let cancelled = false;
    void fetch("/api/kiosk/state")
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setPinSet(body.pinSet === true);
      })
      .catch(() => {
        // Assume there is one: the pad still works, and the exit route is the
        // thing that actually decides.
        if (!cancelled) setPinSet(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, pinSet]);

  async function unlock(value: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/kiosk/exit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });
      const body = await response.json();
      if (!body.ok) {
        haptic("error");
        setError(body.error ?? "That PIN is wrong.");
        setPin("");
        return;
      }
      haptic("success");
      // A full load: the middleware decides what is served, and it has to see
      // the cleared cookie.
      window.location.reload();
    } catch {
      haptic("error");
      setError("Could not check that PIN.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (busy) return;
    haptic("tap");
    const next = `${pin}${digit}`.slice(0, 4);
    setPin(next);
    setError(null);
    // Submits itself on the fourth digit: a separate confirm button is one more
    // thing to find on a screen somebody is holding out to be handed back.
    if (isPinShaped(next)) void unlock(next);
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-subtle px-3 py-2">
        <Icon name="shield" className="size-4 shrink-0 text-muted" />
        <p className="min-w-0 flex-1 text-xs text-muted">
          Browsing the catalogue. The rest of the app is locked.
        </p>
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setPin("");
            setError(null);
            setOpen(true);
          }}
          className="pressable min-h-9 shrink-0 rounded-xl border border-line bg-surface px-3 text-xs font-medium"
        >
          Unlock
        </button>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={pinSet === false ? "No PIN on this account" : "Enter your PIN"}
      >
        {pinSet === false ? (
          <div className="space-y-4 px-3 pb-4 pt-1">
            <p className="text-sm text-muted">
              There is no PIN set on this account, so there is nothing to unlock
              with. Leave browsing and set one on your profile — after that,
              handing the phone over needs it back.
            </p>
            <button
              type="button"
              onClick={() => void unlock("")}
              disabled={busy}
              className="pressable min-h-11 w-full rounded-xl bg-brand text-sm font-medium text-brand-fg disabled:opacity-60"
            >
              {busy ? "Leaving…" : "Leave browsing"}
            </button>
            {error && (
              <p role="alert" className="text-center text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 px-3 pb-4 pt-1">
            <div className="flex justify-center gap-3" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`size-3.5 rounded-full ${
                    i < pin.length ? "bg-brand" : "bg-line"
                  }`}
                />
              ))}
            </div>

            {error && (
              <p role="alert" className="text-center text-sm text-danger">
                {error}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => press(digit)}
                  disabled={busy}
                  className="pressable min-h-14 rounded-2xl border border-line text-lg font-medium tabular-nums disabled:opacity-60"
                >
                  {digit}
                </button>
              ))}
              <span />
              <button
                type="button"
                onClick={() => press("0")}
                disabled={busy}
                className="pressable min-h-14 rounded-2xl border border-line text-lg font-medium tabular-nums disabled:opacity-60"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic("tap");
                  setPin((p) => p.slice(0, -1));
                  setError(null);
                }}
                disabled={busy}
                aria-label="Delete"
                className="pressable flex min-h-14 items-center justify-center rounded-2xl border border-line disabled:opacity-60"
              >
                <Icon name="chevron" className="size-5 rotate-180" />
              </button>
            </div>

            <p className="text-center text-xs text-muted">
              {busy ? "Checking…" : "Set a PIN on your profile if you have not."}
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}
