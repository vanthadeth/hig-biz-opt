"use client";

import { useEffect, useState } from "react";
import { locationProblem, usableFix, type Fix } from "@/lib/visits";

/**
 * Where this phone thinks it is, asked once when a screen opens.
 *
 * Never insisted on. A refusal, a phone indoors, an IP-address guess dressed
 * as a position — each gives a sentence a rep can act on and nothing else
 * stops. Checking in and out both work without a fix; the distance is simply
 * recorded as unknown, which the report reads differently from far away.
 *
 * Shared by the two screens that need it so there is one answer to "did we
 * ask, and what happened" rather than two that can drift apart.
 */
export function useFix(): { fix: Fix | null; problem: string | null } {
  const [fix, setFix] = useState<Fix | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const got = usableFix({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
        });
        setFix(got);
        setProblem(
          got
            ? null
            : "Your phone's location is too rough to use. The visit will be recorded without a distance.",
        );
      },
      (err) => {
        if (!cancelled) setProblem(locationProblem(err.code ?? null));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );

    return () => {
      cancelled = true;
    };
    // Once, when the screen opens. Re-asking on every render would put the
    // browser's permission prompt in a loop.
  }, []);

  return { fix, problem };
}
