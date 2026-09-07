"use client";

import { usePathname } from "next/navigation";
import { RouteTransition } from "@/components/motion/RouteTransition";
import { ShellProvider, type ShellData } from "@/components/shell/ShellContext";
import { TitleBar } from "@/components/shell/TitleBar";
import { visitTitle } from "@/lib/visitNav";
import { VisitNav } from "./VisitNav";

/**
 * My Visit's shell — the counterpart of `AppShell`, and deliberately smaller.
 *
 * `AppShell` grows sideways: a bottom bar on a phone, an icon rail on a tablet,
 * a labelled sidebar on a desktop, because the views it serves are a dozen
 * modules deep and somebody works through them sitting down. This app is three
 * screens that are used standing up, so there is one layout and it is the phone
 * one. A wider screen gets the same thing, centred.
 *
 * The provider and the title bar are shared with `AppShell` rather than
 * reimplemented: the account menu, the theme switcher and the view switcher are
 * the same in both, and a rep who holds Sale as well should not find a second,
 * subtly different version of their own profile menu here.
 */
export function VisitShell({
  data,
  openVisitId,
  children,
}: {
  data: ShellData;
  /** The visit still open, if there is one. It decides what the centre button does. */
  openVisitId: string | null;
  children: React.ReactNode;
}) {
  // Read here rather than passed down from the layout: a layout has no pathname,
  // and a client component that already knows one should not be handed it.
  const title = visitTitle(usePathname());

  return (
    <ShellProvider value={data}>
      <div className="flex min-h-dvh flex-col">
        <TitleBar title={title} />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-32 pt-20">
          <RouteTransition>{children}</RouteTransition>
        </main>
        <VisitNav openVisitId={openVisitId} />
      </div>
    </ShellProvider>
  );
}
