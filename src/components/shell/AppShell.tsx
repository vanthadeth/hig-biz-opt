import { RouteTransition } from "@/components/motion/RouteTransition";
import { ShellProvider, type ShellData } from "./ShellContext";
import { TitleBar } from "./TitleBar";
import { BottomNav } from "./BottomNav";
import { SideNav } from "./SideNav";

/**
 * The one place navigation is rendered. Phone gets an auto-hiding title bar and
 * bottom bar; tablet swaps the bottom bar for an icon rail; desktop widens the
 * rail into a labelled sidebar. Same tree at every size.
 */
export function AppShell({
  data,
  locked = false,
  children,
}: {
  data: ShellData;
  /**
   * Kiosk: the phone is in a customer's hands. No navigation is rendered — but
   * the context still is. Children reach for it (the page heading comes from
   * the module registry through `useShell`), and a provider that vanished in
   * one mode would take the page down with it rather than hiding a menu.
   */
  locked?: boolean;
  children: React.ReactNode;
}) {
  if (locked) {
    return (
      <ShellProvider value={data}>
        <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-4">{children}</main>
      </ShellProvider>
    );
  }

  return (
    <ShellProvider value={data}>
      <SideNav />
      <div className="flex min-h-dvh flex-col md:pl-18 lg:pl-60">
        <TitleBar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-32 pt-20 md:pb-10">
          <RouteTransition>{children}</RouteTransition>
        </main>
        <BottomNav />
      </div>
    </ShellProvider>
  );
}
