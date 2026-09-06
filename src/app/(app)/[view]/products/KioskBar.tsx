"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { isPinShaped } from "@/lib/kiosk";

/**
 * Marks that this page has already reloaded itself once over an expired lock.
 * Per tab, and gone when the tab is, which is exactly the life of the problem
 * it guards against.
 */
const STALE_RELOAD = "hig.kiosk.staleReload";

/**
 * The way out of kiosk mode, and the only one.
 *
 * It sits on the catalogue's title row because that is the one page a locked
 * device can be on. Everything else redirects here, so a button anywhere else
 * would be a button nobody could reach.
 *
 * The component stays mounted whether or not anything is on screen: the
 * keep-alive below is what tells the server this lock is still in somebody's
 * hands, and a page that stopped saying so would unlock itself.
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

  /**
   * Keep the lock alive while this page is.
   *
   * The lock expires on its own, and this is the only thing that stops it. So
   * closing the app ends it a few minutes later without anybody doing
   * anything, and a launch tomorrow morning opens the ordinary app — which is
   * the point, and cannot be had from a cookie alone.
   *
   * Only while the page is visible. A phone in a pocket is not a hand-over in
   * progress, and the browser throttles the timer there anyway; coming back to
   * the page says so at once rather than waiting for the next tick.
   */
  useEffect(() => {
    let stopped = false;

    async function keepAlive() {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/kiosk/keep", { method: "POST" });
        if (stopped) return;

        if (response.ok) {
          // Alive again, so a later expiry gets its own reload.
          try {
            sessionStorage.removeItem(STALE_RELOAD);
          } catch {
            // Private mode. The guard below is a courtesy, not the mechanism.
          }
          return;
        }

        // The lock expired while this page sat there — the app is not locked
        // any more, so the page has to stop pretending it is. Reloading brings
        // the shell back, because the server will render it unlocked.
        if (response.status !== 409) return;

        // Once. The reloaded page should come back unlocked and never reach
        // here again; if something goes wrong and it does, a second reload
        // would be an endless one, in a customer's hands, on a page with no
        // way out of it.
        let reloadedAlready = false;
        try {
          reloadedAlready = sessionStorage.getItem(STALE_RELOAD) === "1";
          sessionStorage.setItem(STALE_RELOAD, "1");
        } catch {
          // Private mode: no guard available. Reload once and stop trying,
          // which the flag below does without any storage at all.
        }
        stopped = true;
        if (!reloadedAlready) window.location.reload();
      } catch {
        // Offline. Left to expire, which is the safe direction: the way out is
        // a PIN typed into a page that is already loaded.
      }
    }

    void keepAlive();
    // Well inside the grace, so a few missed beats are survivable.
    const timer = setInterval(keepAlive, 60_000);
    document.addEventListener("visibilitychange", keepAlive);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", keepAlive);
    };
  }, []);

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
      {/* The button alone. It sits on the title row, where the space belongs to
          the catalogue rather than to a strip explaining itself. */}
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          setPin("");
          setError(null);
          setOpen(true);
        }}
        aria-label="Unlock the app"
        title="Unlock"
        className="pressable flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:text-fg"
      >
        <Icon name="logout" className="size-5" />
      </button>

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
