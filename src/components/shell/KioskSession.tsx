"use client";

import { useEffect } from "react";

/**
 * The other half of KioskGuard: what happens once the page is hidden.
 *
 * Runs on mount, reads the flag the blocking script set, and — if this lock is
 * from a session that has ended — clears it and goes home. `replace` rather
 * than `push`, so the back gesture does not return to a page that is about to
 * throw the customer's catalogue up again.
 */
export function KioskSession({ homeHref }: { homeHref: string }) {
  useEffect(() => {
    if (document.documentElement.dataset.kioskOrphan !== "1") return;
    let cancelled = false;

    void fetch("/api/kiosk/abandon", { method: "POST" })
      .catch(() => {
        // Offline. Going home anyway would land on a page the middleware
        // bounces straight back, so the page stays hidden and the reload
        // below is what eventually clears it.
      })
      .then(() => {
        if (!cancelled) window.location.replace(homeHref);
      });

    return () => {
      cancelled = true;
    };
  }, [homeHref]);

  return null;
}
