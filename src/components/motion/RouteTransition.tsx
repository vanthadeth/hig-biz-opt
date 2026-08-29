"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

/**
 * Crossfades page content when the route changes.
 *
 * The bottom bar switches between sibling modules, so this is tab switching
 * rather than going deeper — a crossfade says "same place, different content",
 * where a directional slide would wrongly imply hierarchy.
 *
 * This sits in the layout, and layouts persist across navigation, so React
 * would treat a change as an in-place update and never animate. Keying on the
 * pathname is what makes the old and new content an exit/enter pair.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ViewTransition key={pathname} name="page-content" share="auto" enter="auto" default="none">
      {children}
    </ViewTransition>
  );
}
