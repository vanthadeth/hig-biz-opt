"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { quickActionsFor } from "@/lib/quickActions";
import { can } from "@/lib/permissions";
import { useShell } from "./ShellContext";
import { useState } from "react";

/**
 * The centre button's menu.
 *
 * It lists only what the signed-in person may create in this view, resolved
 * from the same permissions the database enforces — so it cannot offer an
 * action that would then be refused.
 */
export function QuickActions({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { nav, permissions, view } = useShell();
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const actions = quickActionsFor(nav, permissions, view.key);

  // Only where there is a catalogue to browse. The lock is only worth anything
  // if the one thing left reachable is the thing the customer is holding it for.
  const canBrowse = can(permissions, "product", "view");

  /**
   * Hand the phone over.
   *
   * The cookie goes on before the navigation, so there is no moment where the
   * catalogue is open and the rest of the app is still one swipe away.
   */
  async function startBrowsing() {
    haptic("select");
    setLocking(true);
    setLockError(null);
    try {
      const response = await fetch("/api/kiosk/enter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ view: view.key }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not lock the app.");
      onClose();
      // A full load rather than a client navigation: the shell is rendered on
      // the server and has to come back knowing it is locked.
      window.location.href = body.to;
    } catch (e) {
      // Said out loud rather than swallowed. The refusal that matters here is
      // "you have no PIN", and a button that just stops looks broken instead of
      // telling somebody the one thing they need to do.
      haptic("error");
      setLockError(e instanceof Error ? e.message : "Could not lock the app.");
      setLocking(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Quick actions">
      {canBrowse && (
        <div className="px-1 pb-1">
          <button
            type="button"
            onClick={startBrowsing}
            disabled={locking}
            className="pressable flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-subtle disabled:opacity-60"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-tint-3-fg">
              <Icon name="box" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {locking ? "Locking…" : "Catalog"}
              </span>
              {/* Said before it happens, because handing somebody your phone is
                  not a thing to discover you have done. */}
              <span className="block text-xs text-muted">
                Hand the phone over. Everything else needs your PIN.
              </span>
            </span>
            <Icon name="chevron" className="size-4 shrink-0 text-muted" />
          </button>
          {lockError && (
            <p role="alert" className="px-3 pb-1 pt-1 text-xs text-danger">
              {lockError}{" "}
              <Link
                href={`/${view.key}/profile`}
                onClick={() => onClose()}
                className="underline"
              >
                Go to your profile
              </Link>
            </p>
          )}
        </div>
      )}

      {actions.length === 0 ? (
        !canBrowse && (
          <p className="px-3 pb-4 pt-1 text-sm text-muted">
            You do not have permission to create anything in {view.name}.
          </p>
        )
      ) : (
        <ul className="stagger">
          {actions.map((action, i) => (
            <li key={action.moduleKey} style={{ "--i": i } as React.CSSProperties}>
              <Link
                href={action.href}
                onClick={() => {
                  haptic("tap");
                  onClose();
                }}
                className="pressable flex min-h-14 items-center gap-3 rounded-2xl px-3 hover:bg-subtle"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Icon name={action.icon} className="size-5" />
                </span>
                <span className="flex-1 text-sm font-medium">{action.label}</span>
                <Icon name="chevron" className="size-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
