"use client";

import { createContext, useContext } from "react";
import type { NavItem, Viewer, ViewSummary } from "@/lib/access";

export type ShellData = {
  viewer: Viewer;
  view: ViewSummary;
  views: ViewSummary[];
  nav: NavItem[];
};

const ShellContext = createContext<ShellData | null>(null);

export function ShellProvider({
  value,
  children,
}: {
  value: ShellData;
  children: React.ReactNode;
}) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellData {
  const data = useContext(ShellContext);
  if (!data) throw new Error("useShell must be used inside ShellProvider");
  return data;
}

/**
 * The label for the page currently on screen, derived from the URL and the
 * navigation set. Keeping it in one place means the title bar and the page
 * heading can never drift apart, and a page file needs to say nothing at all.
 */
export function usePageTitle(pathname: string): string {
  const { view, nav } = useShell();
  const segment = pathname.split("/").filter(Boolean)[1] ?? "home";

  if (segment === "home") return view.name;
  if (segment === "profile") return "Profile";

  const item = nav.find((n) => n.href === segment);
  if (item) return item.name;

  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
