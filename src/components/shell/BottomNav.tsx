"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/ui/Sheet";
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
 * Four slots around a raised centre button. Home plus three modules fit
 * directly; anything beyond that collapses into a More sheet rather than
 * shrinking the labels until they are unreadable.
 */
export function BottomNav() {
  const pathname = usePathname();
  const hidden = useScrollHidden();
  const { view, nav } = useShell();
  const [quickOpen, setQuickOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const all = entries(nav);
  const overflow = all.length > 4 ? all.slice(3) : [];
  const slots = overflow.length ? all.slice(0, 3) : all.slice(0, 4);

  const left = slots.slice(0, 2);
  const right = slots.slice(2);

  const item = (entry: { key: string; name: string; icon: string; href: string }) => {
    const href = `/${view.key}/${entry.href}`;
    const active = pathname === href;
    return (
      <li key={entry.key} className="flex-1">
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-muted transition-colors aria-[current=page]:text-brand"
        >
          <Icon name={entry.icon} className="size-5.5" />
          <span className="max-w-full truncate text-[10px] font-medium leading-none">
            {entry.name}
          </span>
        </Link>
      </li>
    );
  };

  const moreActive = overflow.some((e) => pathname === `/${view.key}/${e.href}`);

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

          <li className="flex w-20 shrink-0 justify-center">
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              aria-label="Quick actions"
              aria-haspopup="dialog"
              aria-expanded={quickOpen}
              className="pressable -mt-6 flex size-14 items-center justify-center rounded-full bg-brand text-brand-fg shadow-[var(--shadow-fab)]"
            >
              <Icon name="plus" className="size-6" />
            </button>
          </li>

          {right.map(item)}

          {overflow.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-current={moreActive ? "page" : undefined}
                className="flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-muted transition-colors aria-[current=page]:text-brand"
              >
                <Icon name="dots" className="size-5.5" />
                <span className="text-[10px] font-medium leading-none">More</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      <QuickActions open={quickOpen} onClose={() => setQuickOpen(false)} />

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="stagger">
          {overflow.map((entry, i) => (
            <li key={entry.key} style={{ "--i": i } as React.CSSProperties}>
              <Link
                href={`/${view.key}/${entry.href}`}
                onClick={() => setMoreOpen(false)}
                className="pressable flex min-h-14 items-center gap-3 rounded-2xl px-3 hover:bg-subtle"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
                  <Icon name={entry.icon} className="size-5" />
                </span>
                <span className="flex-1 text-sm font-medium">{entry.name}</span>
                <Icon name="chevron" className="size-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
