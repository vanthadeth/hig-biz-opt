"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { haptic } from "@/lib/haptics";
import { KIOSK_SESSION_KEY } from "@/lib/kiosk";
import { quickTiles, splitTiles, type QuickTile } from "@/lib/quickActions";
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
  // The catalogue tile is only offered where there is a catalogue to browse;
  // `quickTiles` decides that from the same permission the database enforces.
  const { lead, rest } = splitTiles(quickTiles(nav, permissions, view.key));

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

      // Remembered before leaving, so the catalogue that loads next recognises
      // the lock as its own. Without this it would read as a leftover from a
      // session that ended, and undo itself on arrival.
      try {
        sessionStorage.setItem(KIOSK_SESSION_KEY, body.nonce);
      } catch {
        // Private mode, or storage refused. The lock still holds — the grace
        // window is what covers this — it just will not survive the app being
        // closed, which is the safer way for it to fail.
      }

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

  function Tile({ tile, i }: { tile: QuickTile; i: number }) {
    const inside = (
      <>
        <span className="grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand">
          <Icon name={tile.icon} className="size-6" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {tile.key === "catalog" && locking ? "Locking…" : tile.label}
          </span>
          {tile.hint && (
            // Wrapped rather than truncated: a hint cut off mid-word is worse
            // than no hint, and these are three or four words.
            <span className="block text-xs leading-tight text-muted">{tile.hint}</span>
          )}
        </span>
      </>
    );

    const shell =
      "pressable flex min-h-24 flex-col items-start justify-between gap-2 rounded-2xl border border-line p-3 text-left disabled:opacity-60";

    // The catalogue locks the app rather than navigating, so it is a button
    // however much it looks like its neighbours.
    return tile.href === null ? (
      <button
        type="button"
        onClick={startBrowsing}
        disabled={locking}
        style={{ "--i": i } as React.CSSProperties}
        className={shell}
      >
        {inside}
      </button>
    ) : (
      <Link
        href={tile.href}
        onClick={() => {
          haptic("tap");
          onClose();
        }}
        style={{ "--i": i } as React.CSSProperties}
        className={shell}
      >
        {inside}
      </Link>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="Quick actions">
      <div className="space-y-4 p-3">
        {lead.length > 0 && (
          <div className="stagger grid grid-cols-2 gap-2">
            {lead.map((tile, i) => (
              <Tile key={tile.key} tile={tile} i={i} />
            ))}
          </div>
        )}

        {lockError && (
          <p role="alert" className="text-xs text-danger">
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

        {rest.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Also
            </p>
            <ul className="stagger grid grid-cols-2 gap-2">
              {rest.map((tile, i) => (
                <li key={tile.key} className="contents">
                  <Tile tile={tile} i={lead.length + i} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {lead.length === 0 && rest.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">
            You do not have permission to create anything in {view.name}.
          </p>
        )}
      </div>
    </Sheet>
  );
}
