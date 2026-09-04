"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
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
 * Four slots around a raised centre button: Home, the first two modules of the
 * view, and Menu. Menu is always the fourth rather than appearing only when
 * something overflows — it is a page listing the whole view, not a sheet
 * holding the remainder, so it is worth a fixed place somebody can learn.
 */
export function BottomNav() {
  const pathname = usePathname();
  const hidden = useScrollHidden();
  const { view, nav } = useShell();
  const [quickOpen, setQuickOpen] = useState(false);

  // Three direct slots plus Menu, five equal columns counting the centre
  // button. Three rather than four because Menu always takes the last one.
  const slots = entries(nav).slice(0, 3);

  const left = slots.slice(0, 2);
  const right = slots.slice(2);

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

          {item({ key: "menu", name: "Menu", icon: "menu", href: "menu" })}
        </ul>
      </nav>

      <QuickActions open={quickOpen} onClose={() => setQuickOpen(false)} />
    </>
  );
}
