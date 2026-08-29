"use client";

import { usePathname } from "next/navigation";
import { usePageTitle } from "@/components/shell/ShellContext";

/**
 * The page heading. It takes no props on purpose: the label comes from the URL
 * and the module registry, so every page file stays blank and no page can drift
 * out of step with the title bar above it.
 */
export function PageTitle() {
  const pathname = usePathname();
  const title = usePageTitle(pathname);

  return (
    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
  );
}
