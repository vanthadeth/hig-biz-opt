"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { groupNav } from "@/lib/nav";
import { haptic } from "@/lib/haptics";
import { useScrollHidden } from "@/hooks/useScrollDirection";
import { QuickActions } from "./QuickActions";
import { useShell } from "./ShellContext";

/** Home, then the view's modules. */
function entries(nav: ReturnType<typeof useShell>["nav"]) {
  return [
    { key: "home", name: "Home", icon: "home", href: "home" },
    ...nav.map((n) => ({ key: n.module_key, name: n.name, icon: n.icon, href: n.href })),
  ];
}

/**
 * Phone navigation.
 *
 * Five slots, no more: Home, the view's first two modules, the raised centre
 * button, and Menu on the right. Five is not a style choice — a 320px phone
 * gives each slot 64px, and a sixth would push the labels below the width
 * their words need.
 *
 * Menu holds the last slot always, rather than appearing only when something
 * overflows, so it is somewhere a person can learn rather than somewhere that
 * moves as their permissions change.
 */
export function BottomNav() {
  const pathname = usePathname();
  const hidden = useScrollHidden();
  const { view, nav, modules } = useShell();
  const [quickOpen, setQuickOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Three direct slots plus the centre button and Menu makes five.
  const slots = entries(nav).slice(0, 3);

  const left = slots.slice(0, 2);
  const right = slots.slice(2);

  // Everything this person can reach, not just this view's modules — which is
  // what makes the sheet worth opening rather than a longer version of the bar.
  const groups = groupNav(modules);
  const menuActive = modules.some((m) => pathname === `/${m.view_key}/${m.href}`);

  const item = (entry: { key: string; name: string; icon: string; href: string }) => {
    const href = `/${view.key}/${entry.href}`;
    const active = pathname === href;
    return (
      <li key={entry.key} className="flex-1">
        <Link
          href={href}
          onClick={() => haptic("tap")}
          aria-current={active ? "page" : undefined}
          className="flex min-h-16 flex-col items-center justify-center gap-1.5 px-1 py-2 text-muted transition-colors aria-[current=page]:text-brand"
        >
          <Icon name={entry.icon} className="size-6" />
          <span className="max-w-full truncate text-[11px] font-medium leading-none">
            {entry.name}
          </span>
        </Link>
      </li>
    );
  };


  return (
    <>
      <nav
        data-hidden={hidden}
        aria-label="Main"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          viewTransitionName: "shell-bottomnav",
        }}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-md transition-transform duration-200 ease-out data-[hidden=true]:translate-y-[calc(100%+env(safe-area-inset-bottom))] md:hidden"
      >
        <ul className="flex items-center">
          {left.map(item)}

          <li className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={() => {
                haptic("select");
                setQuickOpen(true);
              }}
              aria-label="Quick actions"
              aria-haspopup="dialog"
              aria-expanded={quickOpen}
              className="pressable -mt-7 flex size-15 items-center justify-center rounded-full bg-brand text-brand-fg shadow-[var(--shadow-fab)]"
            >
              <Icon name="plus" className="size-7" />
            </button>
          </li>

          {right.map(item)}

          <li className="flex-1">
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setMenuOpen(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-current={menuActive ? "page" : undefined}
              className="flex min-h-16 w-full flex-col items-center justify-center gap-1.5 px-1 py-2 text-muted transition-colors aria-[current=page]:text-brand"
            >
              <Icon name="menu" className="size-6" />
              <span className="text-[11px] font-medium leading-none">Menu</span>
            </button>
          </li>
        </ul>
      </nav>

      <QuickActions open={quickOpen} onClose={() => setQuickOpen(false)} />

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        {/* Capped and scrollable: the list grows with the person's permissions,
            and an administrator's runs past the height of a phone. */}
        <div className="max-h-[60vh] overflow-y-auto px-1 pb-2">
          {groups.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted">
              Nothing here yet. Ask an administrator which modules your role
              should reach.
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.name} className="pt-2 first:pt-0">
                <h3 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  {group.name}
                </h3>
                <ul>
                  {group.items.map((entry) => (
                    <li key={entry.module_key}>
                      <Link
                        href={`/${entry.view_key}/${entry.href}`}
                        onClick={() => {
                          haptic("tap");
                          setMenuOpen(false);
                        }}
                        className="pressable flex min-h-14 items-center gap-3 rounded-2xl px-3 hover:bg-subtle"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                          <Icon name={entry.icon} className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {entry.name}
                          </span>
                          {/* Named only when it leads out of the view they are
                              standing in, since the shell changes underfoot. */}
                          {entry.view_key !== view.key && (
                            <span className="block truncate text-xs text-muted">
                              Opens in {entry.view_name}
                            </span>
                          )}
                        </span>
                        <Icon name="chevron" className="size-4 shrink-0 text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </Sheet>
    </>
  );
}
